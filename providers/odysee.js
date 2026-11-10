/*
 * Odysee Public - Nuvio Provider
 * Searches Odysee's documented Lighthouse API and resolves only claims
 * carrying an explicit reusable license (CC0, Public Domain, CC BY / BY-SA).
 */
var VERSION = "1.1.3";
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
  if(!TMDB_KEY) { log("TMDB_API_KEY is not available"); return Promise.resolve(null); }
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
    if(!Array.isArray(rows)) { log("Unexpected Lighthouse response format"); return []; }
    log("Lighthouse \"" + query + "\" returned " + rows.length + " candidates");
    return rows.filter(function(x){return x && x.name && x.claimId;});
  });
}
function resolveClaim(item,deadline) {
  var uri="lbry://"+item.name+":"+item.claimId;
  return requestJson(SDK_API,"POST",{
    jsonrpc:"2.0",id:1,method:"get",params:{uri:uri}
  },deadline).then(function(j){
    var result=j&&(j.result||j.data||j);
    if(Array.isArray(result)) result=result[0];
    if(!result) { log("Failed to resolve claim: " + item.name); return null; }
    
    // Extract nested inner claim object for proper license verification
    var innerClaim = result.claim || result;
    if(!licensed(innerClaim)) { log("Claim skipped: reusable license could not be verified"); return null; }
    
    var value = innerClaim.value || {};
    var stream = result.streaming_url || result.streamingUrl || "";
    
    if(!stream && innerClaim.name && innerClaim.claim_id) {
      stream = PLAYER + "/api/v4/streams/free/" + encodeURIComponent(innerClaim.name) + "/" + encodeURIComponent(innerClaim.claim_id) + "/master.m3u8";
    }
    
    if(!/^https:\/\//i.test(stream)) return null;
    
    // Extract video resolution metadata dynamically
    var height = value.video && value.video.height;
    var qualityStr = height ? height + "p" : "Auto";
    
    return {
      url: stream,
      title: clean(value.title || innerClaim.name),
      license: String(value.license || (value.metadata && value.metadata.license) || ""),
      quality: qualityStr
    };
  });
}
function getStreams(tmdbId,mediaType,season,episode) {
  var type=String(mediaType||"").toLowerCase();
  type=(type==="movie"||type==="film")?"movie":"tv";
  var ep=Math.max(1,Number(episode)||1), deadline=Date.now()+TIMEOUT_MS;
  log("Starting lookup: type="+type+" tmdb="+tmdbId+" episode="+ep);
  return tmdbTitle(tmdbId,type,deadline).then(function(meta){
    if(!meta) { log("TMDB metadata is unavailable; check TMDB_API_KEY and the catalog ID"); return []; }
    log("TMDB title: " + meta.title + " / " + meta.original);
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
        var searchable=clean([x.title,x.name,x.description,x.channel].join(" "));
        var best=Math.max(titleScore(meta.title,searchable),titleScore(meta.original,searchable));
        x.matchScore=best;
        return best>=0.12;
      }).sort(function(a,b){return b.matchScore-a.matchScore;}).slice(0,MAX_RESULTS*3);
      log("Title-matched candidates: "+candidates.length);
      if(!candidates.length) { log("No candidates passed title matching; claim resolution was skipped"); return []; }
      return Promise.all(candidates.map(function(x){return resolveClaim(x,deadline);})).then(function(resolved){
        var out=[];
        resolved.forEach(function(x){
          if(!x || out.length>=MAX_RESULTS) return;
          out.push({
            name: PROVIDER,
            title: x.title + " • " + x.license,
            url: x.url,
            quality: x.quality,
            headers: {"Referer":"https://odysee.com/","Origin":"https://odysee.com","User-Agent":UA,"Accept":"*/*"}
          });
        });
        log("Verified reusable-license streams found: "+out.length);
        return out;
      });
    });
  }).catch(function(e){log("getStreams error: "+(e&&e.message||e));return [];});
}
module.exports={getStreams:getStreams};
    
