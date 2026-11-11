/*
 * Odysee Public - Nuvio Provider
 * Searches Odysee's documented Lighthouse API and resolves only claims
 * carrying an explicit reusable license (CC0, Public Domain, CC BY / BY-SA).
 */
var VERSION = "1.1.4";
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
  return String(s || "").replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, function(_,x){return String.fromCharCode(parseInt(x,16));})
    .replace(/&#([0-9]+);/g, function(_,x){return String.fromCharCode(parseInt(x,10));})
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}
function norm(s) { return clean(s).toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); }
function titleScore(a,b) {
  var x=norm(a).split(" "), y=norm(b).split(" "), set={}, hit=0, i;
  for(i=0;i<y.length;i++) if(y[i]) set[y[i]]=1;
  for(i=0;i<x.length;i++) if(x[i] && set[x[i]]) hit++;
  return x.length && y.length ? 2*hit/(x.length+y.length) : 0;
}
function requestJson(url, method, body, deadline, extraHeaders) {
  if(Date.now()>deadline) return Promise.resolve(null);
  var opt={method:method||"GET",redirect:"follow",headers:{
    "User-Agent":UA,"Accept":"application/json","Origin":"https://odysee.com","Referer":"https://odysee.com/"
  }};
  if(extraHeaders) { for(var k in extraHeaders) if(Object.prototype.hasOwnProperty.call(extraHeaders,k)) opt.headers[k]=extraHeaders[k]; }
  if(body!==null && body!==undefined) { opt.headers["Content-Type"]="application/json"; opt.body=JSON.stringify(body); }
  return fetch(url,opt).then(function(r){
    if(!r || r.ok===false) { log("HTTP "+(r?r.status:"no response")); return null; }
    return r.text().then(function(t){try{return JSON.parse(t);}catch(e){return null;}});
  }).catch(function(e){log("request error: "+(e&&e.message||e));return null;});
}
function tmdbTitle(id,type,deadline) {
  if(!TMDB_KEY) { log("TMDB_API_KEY is not available"); return Promise.resolve(null); }
  var kind=type==="movie"?"movie":"tv";
  var cleanId=String(id==null?"":id).replace(/^tmdb:/i,"").trim();
  if(!/^\d+$/.test(cleanId)) { log("Unsupported TMDB id: "+id); return Promise.resolve(null); }
  var url="https://api.themoviedb.org/3/"+kind+"/"+cleanId+"?language=en-US", headers={};
  // v4 read-access tokens are JWTs and go in a header; v3 keys go in the query string.
  if(/^eyJ/.test(TMDB_KEY) || TMDB_KEY.length>40) headers.Authorization="Bearer "+TMDB_KEY;
  else url+="&api_key="+encodeURIComponent(TMDB_KEY);
  return requestJson(url,"GET",null,deadline,headers).then(function(d){
    var t=d&&(d.name||d.title||d.original_name||d.original_title);
    return t?{title:String(t),original:String(d.original_name||d.original_title||t)}:null;
  });
}
// Accepts only CC0 / Public Domain / CC BY / CC BY-SA. NonCommercial and NoDerivatives variants are rejected.
function licensed(meta) {
  var v=meta && (meta.value || meta);
  var raw=String((v && (v.license || (v.metadata && v.metadata.license))) || "");
  var license=raw.toLowerCase().replace(/[._-]+/g," ").replace(/\s+/g," ").trim();
  if(/non ?commercial|\bnc\b|no ?deriv|\bnd\b/.test(license)) return false;
  return /public domain|\bcc0\b|creative commons attribution|\bcc by\b/.test(license);
}
function episodeMatches(text,ep) {
  var n=String(ep);
  return new RegExp("\\b(?:episode|ep|e)\\s*0*"+n+"\\b|\\bs\\d{1,2}\\s*e0*"+n+"\\b|(?:^|[\\s#_-])0*"+n+"(?:$|[\\s#_.-])","i").test(text);
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
    if(!result || typeof result!=="object") { log("Failed to resolve claim: " + item.name); return null; }

    // `get` returns a flat file object (claim_name, metadata); `resolve` nests it under `claim.value`.
    var inner=result.claim || result;
    if(!licensed(inner)) { log("Claim skipped: reusable license could not be verified"); return null; }

    var value=inner.value || inner.metadata || {};
    var name=inner.name || inner.claim_name || item.name;
    var claimId=inner.claim_id || item.claimId;
    var stream=result.streaming_url || result.streamingUrl || inner.streaming_url || "";

    if(!stream && name && claimId) {
      stream=PLAYER+"/api/v4/streams/free/"+encodeURIComponent(name)+"/"+encodeURIComponent(claimId)+"/master.m3u8";
    }
    if(!/^https:\/\//i.test(stream)) return null;

    var height=value.video && value.video.height;
    return {
      url: stream,
      title: clean(value.title || item.title || name),
      license: String(value.license || (value.metadata && value.metadata.license) || ""),
      quality: height ? height + "p" : "Auto"
    };
  });
}
function getStreams(tmdbId,mediaType,season,episode) {
  var type=String(mediaType||"").toLowerCase();
  type=(type==="movie"||type==="film")?"movie":"tv";
  var ep=Math.max(1,Number(episode)||1), deadline=Date.now()+TIMEOUT_MS;
  log("Starting lookup: type="+type+" tmdb="+tmdbId+(type==="tv"?" episode="+ep:""));
  return tmdbTitle(tmdbId,type,deadline).then(function(meta){
    if(!meta) { log("TMDB metadata is unavailable; check TMDB_API_KEY and the catalog ID"); return []; }
    log("TMDB title: " + meta.title + " / " + meta.original);
    var queries=type==="tv"?[
      meta.title+" episode "+ep,meta.title+" ep "+ep,meta.title+" "+ep,
      meta.original+" episode "+ep,meta.title,meta.original
    ]:[meta.title,meta.original];
    var seenQuery={}, seenClaim={}, candidates=[];
    queries=queries.filter(function(q){
      var k=norm(q);
      if(!k || seenQuery[k]) return false;
      seenQuery[k]=1; return true;
    });
    return Promise.all(queries.map(function(q){return searchClaims(q,deadline);})).then(function(groups){
      groups.forEach(function(group){group.forEach(function(item){
        if(!seenClaim[item.claimId]) { seenClaim[item.claimId]=1; candidates.push(item); }
      });});
      candidates=candidates.filter(function(x){
        // Match on the claim's own title/name; descriptions are too noisy and caused false matches.
        var texts=[clean(x.title||""),clean(x.name||"")], best=0;
        for(var i=0;i<texts.length;i++) {
          if(!texts[i]) continue;
          var bare=texts[i].replace(/\b(?:episode|ep)\s*\d+|\bs\d{1,2}\s*e\d+\b|\b\d+\b/ig," ");
          best=Math.max(best,titleScore(meta.title,texts[i]),titleScore(meta.original,texts[i]),
            titleScore(meta.title,bare),titleScore(meta.original,bare));
        }
        x.matchScore=best;
        if(best<0.4) return false;
        // A series claim for the wrong episode must not be returned as this episode.
        if(type==="tv" && !texts.some(function(t){return t && episodeMatches(t,ep);})) return false;
        return true;
      }).sort(function(a,b){return b.matchScore-a.matchScore;}).slice(0,MAX_RESULTS*2);
      log("Title-matched candidates: "+candidates.length);
      if(!candidates.length) { log("No candidates passed title matching; claim resolution was skipped"); return []; }
      return Promise.all(candidates.map(function(x){return resolveClaim(x,deadline);})).then(function(resolved){
        var out=[], seenUrl={};
        resolved.forEach(function(x){
          if(!x || out.length>=MAX_RESULTS || seenUrl[x.url]) return;
          seenUrl[x.url]=1;
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
