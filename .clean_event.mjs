import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const REAL = 60618148093
const ts = () => new Date().toISOString().slice(11,19)
for (let i=0;i<240;i++){
  const { data } = await sb.from("pcm_upload_events").select("*").eq("recording","Studio 2 41")
  if (data && data.length){
    for (const e of data){
      const gb = (Number(e.bytes)/1e9).toFixed(2)
      if (Number(e.bytes) > REAL * 1.05){
        await sb.from("pcm_upload_events").delete().eq("id", e.id)
        console.log(`[${ts()}] DELETED inflated event id=${e.id} (${gb} GB > real 60.62 GB)`)
      } else {
        console.log(`[${ts()}] kept accurate event id=${e.id} (${gb} GB)`)
      }
    }
    process.exit(0)
  }
  const { data: rec } = await sb.from("pcm_recordings").select("state").eq("recording","Studio 2 41").maybeSingle()
  if (i % 10 === 0) console.log(`[${ts()}] waiting… state=${rec?.state}, no event yet (check ${i})`)
  await new Promise(r=>setTimeout(r, 60000))
}
console.log(`[${ts()}] gave up after ~4h`)
