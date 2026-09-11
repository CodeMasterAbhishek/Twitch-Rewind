
const clientId = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const channel = "zackrawrr";

async function test() {
  const res1 = await fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: { "Client-ID": clientId, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `query { user(login: "${channel}") { stream { id createdAt type archiveVideo { id status createdAt lengthSeconds } } } }` })
  }).then(r => r.json());
  
  if (!res1.data.user.stream) { console.log("No stream"); return; }
  console.log("Stream data:", JSON.stringify(res1.data.user.stream.archiveVideo));
  
  const vodId = res1.data.user.stream.archiveVideo.id;
  
  const res2 = await fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: { "Client-ID": clientId, "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "PlaybackAccessToken",
      variables: { vodID: vodId, params: { platform: "web", playerBackend: "mediaplayer", playerType: "site" } },
      query: "query PlaybackAccessToken($vodID: ID!, $params: PlaybackAccessTokenParams!) { videoPlaybackAccessToken(id: $vodID, params: $params) { value signature } }"
    })
  }).then(r => r.json());
  
  console.log("Token:", res2.data.videoPlaybackAccessToken ? "Success" : "Failed");
  
  const token = res2.data.videoPlaybackAccessToken;
  const url = `https://usher.ttvnw.net/vod/${vodId}.m3u8?` + new URLSearchParams({
    nauth: token.value,
    nauthsig: token.signature,
    allow_source: "true",
    allow_audio_only: "true",
    player_backend: "mediaplayer",
    platform: "web"
  });
  
  const res3 = await fetch(url);
  const m3u8 = await res3.text();
  console.log("Usher Status:", res3.status);
  console.log("Manifest Start:", m3u8.substring(0, 200));
}
test();

