/*
 * Odysee Public - Nuvio provider
 * Searches Odysee's documented Lighthouse API and resolves only claims
 * carrying an explicit reusable license (CC0, Public Domain, CC BY / BY-SA).
 */
var VERSION = "1.1.2";
var PROVIDER = "Odysee";
var SEARCH_API = "https://lighthouse.odysee.tv/search";
var SDK_API = "https://api.na-backend.odysee.com/api/v1/proxy?m=get";
var PLAYER = "https://player.odycdn.com";
var UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36";
var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) ? String(TMDB_API_KEY) : "";
var MAX_RESULTS = 6;
var TIMEOUT_MS = 40000;

function log(s) { try { console.log("[OdyseePublic v" + VERSION + "] " + s); } catch(e) {} }
function clean(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, function(_,x){return String.fromCharCode(parseInt(x,16));})
    .replace(/&#([0-9]+);/g, function(_,x){return String.fromCharCode(parseInt(x,10));})
    .replace(/\s+/g, " ").trim();
}
function norm(s) { return clean(s).toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); }
function titleScore(a,b) {
  var x=norm(a).split(" "), y=norm(b).split(" "), set={}, hit=0, i;
  for(i=0;i<y.length;i++) if(y[i]) set[y[i]]=1;
  for(i=0;i<x.length;i++) if(x[i] && set[x[i]]) hit++;
  return x.length && y.length ? 2*hit/(x.length+y.length) : 0;
}
function requestJson(url, method, body, deadline) {
  if(Date.now()>deadline) return Promise.resolve(null);
  var opt={method:method||"GET",redirect:"follow",headers:{
    "User-Agent":UA,"Accept":"application/json","Origin":"https://odysee.com","Referer":"https://odysee.com/"
  }};
  if(body!==null && body!==undefined) { opt.headers["Content-Type"]="application/json"; opt.body=JSON.stringify(body); }
  return fetch(url,opt).then(function(r){
    if(!r || !r.ok) { log("HTTP "+(r?r.status:"no response")); return null; }
    return r.text().then(function(t){try{return JSON.parse(t);}catch(e){return null;}});
  }).catch(function(e){log("request error: "+(e&&e.message||e));return null;});
}
function tmdbTitle(id,type,deadline) {
  if(!TMDB_KEY) { log("TMDB_API_KEY tidak tersedia"); return Promise.resolve(null); }
  var kind=type==="movie"?"movie":"tv";
  var url="https://api.themoviedb.org/3/"+kind+"/"+encodeURIComponent(id)+"?language=en-US&api_key="+encodeURIComponent(TMDB_KEY);
  return requestJson(url,"GET",null,deadline).then(function(j){
    var d=j&&(j.data||j), t=d&&(d.name||d.title||d.original_name||d.original_title);
    return t?{title:String(t),original:String(d.original_name||d.original_title||t)}:null;
  });
}
function licensed(meta) {
  var v=meta && (meta.value || meta);
  var license=String((v && (v.license || (v.metadata && v.metadata.license))) || "").toLowerCase().replace(/[._-]+/g," ");
  return /public domain|cc0|creative commons attribution(?: share alike)?|\bcc by(?: sa)?\b/.test(license);
}
function searchClaims(query,deadline) {
  var url=SEARCH_API+"?s="+encodeURIComponent(query)+"&size=48&from=0&claimType=file&mediaType=video&nsfw=false&free_only=true";
  return requestJson(url,"GET",null,deadline).then(function(rows){
    if(!Array.isArray(rows)) { log("format hasil Lighthouse tidak sesuai"); return []; }
    log("Lighthouse \"" + query + "\" menghasilkan " + rows.length + " kandidat");
    return rows.filter(function(x){return x && x.name && x.claimId;});
  });
}
function resolveClaim(item,deadline) {
  var uri="lbry://"+item.name+":"+item.claimId;
  return requestJson(SDK_API,"POST",{
    jsonrpc:"2.0",id:1,method:"get",params:{uri:uri}
  },deadline).then(function(j){
    var claim=j&&(j.result||j.data||j);
    if(Array.isArray(claim)) claim=claim[0];
    if(!claim) { log("claim tidak berhasil di-resolve: " + item.name); return null; }
    if(!licensed(claim)) { log("claim dilewati: lisensi penggunaan ulang tidak terverifikasi"); return null; }
    var value=claim.value || {};
    var source=value.source || {};
    var stream=claim.streaming_url || claim.streamingUrl || "";
    if(!stream && claim.name && claim.claim_id) {
      stream=PLAYER+"/api/v3/streams/free/"+encodeURIComponent(claim.name)+"/"+encodeURIComponent(claim.claim_id);
      if(source.sd_hash && source.media_type) {
        var ext=String(source.media_type).split("/").pop().replace(/[^a-z0-9]/gi,"");
        stream+="/"+String(source.sd_hash).slice(0,6)+(ext?"."+ext:"");
      }
    }
    if(!/^https:\/\//i.test(stream)) return null;
    return {url:stream,title:clean(claim.value && claim.value.title || item.name),license:String(value.license || (value.metadata&&value.metadata.license) || "")};
  });
}
function getStreams(tmdbId,mediaType,season,episode) {
  var type=String(mediaType||"").toLowerCase();
  type=(type==="movie"||type==="film")?"movie":"tv";
  var ep=Math.max(1,Number(episode)||1), deadline=Date.now()+TIMEOUT_MS;
  log("start type="+type+" tmdb="+tmdbId+" episode="+ep);
  return tmdbTitle(tmdbId,type,deadline).then(function(meta){
    if(!meta) { log("metadata TMDB tidak tersedia; periksa TMDB_API_KEY dan ID katalog"); return []; }
    log("judul TMDB: " + meta.title + " / " + meta.original);
    var queries=type==="tv"?[
      meta.title+" episode "+ep,meta.title+" ep "+ep,meta.title+" "+ep,
      meta.original+" episode "+ep,meta.title,meta.original
    ]:[meta.title,meta.original];
    var unique={}, candidates=[];
    return Promise.all(queries.filter(function(q){return !!q;}).map(function(q){return searchClaims(q,deadline);})).then(function(groups){
      groups.forEach(function(group){group.forEach(function(item){
        var key=item.claimId;
        if(!unique[key]) { unique[key]=1; candidates.push(item); }
      });});
      candidates=candidates.filter(function(x){
        var n=clean(x.name+" "+(x.title||""));
        return titleScore(meta.title,n)>=0.25 || titleScore(meta.original,n)>=0.25;
      }).slice(0,MAX_RESULTS*3);
      log("kandidat cocok setelah pencocokan judul: "+candidates.length);
      if(!candidates.length) { log("tidak ada kandidat judul yang cocok; tidak ada permintaan resolusi claim"); return []; }
      return Promise.all(candidates.map(function(x){return resolveClaim(x,deadline);})).then(function(resolved){
        var out=[];
        resolved.forEach(function(x){
          if(!x || out.length>=MAX_RESULTS) return;
          out.push({name:PROVIDER,title:x.title+" • "+x.license,url:x.url,quality:"Auto",
            headers:{"Referer":"https://odysee.com/","Origin":"https://odysee.com","User-Agent":UA,"Accept":"*/*"}});
        });
        log("stream berlisensi ditemukan: "+out.length);
        return out;
      });
    });
  }).catch(function(e){log("getStreams error: "+(e&&e.message||e));return [];});
}
module.exports={getStreams:getStreams};
