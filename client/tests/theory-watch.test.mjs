import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build, stop } from "esbuild";
import { Window } from "happy-dom";

// Actual TheoryWatch + RPC client + React Query, with only the network replaced.
// Private component export is test-only; production source is not rewritten.
const out = new URL(".test-build/", import.meta.url);
const dom = new Window({ url: "https://terminal.test/" });
let actions, calls, ui, root, qc;
Object.assign(globalThis, { window: dom, document: dom.document, HTMLElement: dom.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true });
globalThis.fetch = async (_url, options) => {
  const { action, args } = JSON.parse(options.body);
  calls.push({ action, args });
  assert.ok(actions[action], `Unexpected action: ${action}`);
  const data = await actions[action](args);
  return new Response(JSON.stringify({ data }), { status: 200 });
};

before(async () => {
  await mkdir(out, { recursive: true });
  await build({
    stdin: { contents: `import {createRoot} from 'react-dom/client';
      import {act,createElement} from 'react';
      import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
      import {TheoryWatch} from '../src/App';
      export {act,QueryClient};
      export function mount(el,client){const root=createRoot(el);
        root.render(createElement(QueryClientProvider,{client},createElement(TheoryWatch,{asset:null,openSymbol:()=>{}})));
        return root;}`, resolveDir: fileURLToPath(new URL(".", import.meta.url)), loader: "tsx" },
    bundle: true, platform: "node", format: "cjs", jsx: "automatic",
    external: ["react", "react-dom", "@tanstack/react-query", "recharts"],
    outfile: fileURLToPath(new URL("ui.cjs", out)),
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "private-component-export", setup(b) {
      b.onLoad({ filter: /client\/src\/App\.tsx$/ }, async ({ path }) => ({
        contents: (await readFile(path, "utf8")) + "\nexport { TheoryWatch };", loader: "tsx"
      }));
    }}]
  });
  ui = (await import(new URL("ui.cjs", out))).default;
});
after(async () => {
  await dom.happyDOM.close(); stop(); await rm(out, { recursive: true, force: true });
});

const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return { promise, resolve, reject }; };
const text = () => document.body.textContent;
const button = label => [...document.querySelectorAll("button")].find(b => b.textContent === label);
const flush = async () => { await ui.act(async () => { await new Promise(r=>setTimeout(r,15)); }); };
const click = async label => { assert.ok(button(label), `Missing button: ${label}`); await ui.act(async()=>button(label).click()); await flush(); };
const stored = { id: 1, headline: "Stored thesis", thesis: "Evidence retained", direction: "bullish", confidence: "low",
  status: "watch", createdAt: "2026-10-15T00:00:00Z", sector: "cross-market", layers: [], sources: [], snapshot: {},
  countercase: "Countercase", invalidation: "Condition" };
async function setup(t, overrides={}) {
  calls=[];
  actions={ listTheoryWatch: async()=>({theories:[],runs:[],error:null}),
    getLatestAgentCrossMarketSynthesis: async()=>({theory:null,error:null}), ...overrides };
  document.body.innerHTML='<div id="root"></div>';
  qc=new ui.QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity},mutations:{gcTime:Infinity}}});
  await ui.act(async()=>{root=ui.mount(document.getElementById("root"),qc);});
  await flush();
  t.after(async()=>{await ui.act(async()=>root.unmount());qc.clear();});
}

test("successful empty read is the only source of the empty-synthesis message", async t=>{
  await setup(t);
  assert.match(text(), /No agent cross-market synthesis stored yet/);
  assert.equal(calls.some(c=>c.action==='runTheoryDiscovery'),false);
});
test("rejected synthesis read shows a recoverable error rather than an empty database", async t=>{
  await setup(t,{getLatestAgentCrossMarketSynthesis:async()=>{throw new Error("503 temporarily overloaded");}});
  assert.match(text(), /503 temporarily overloaded/);
  assert.doesNotMatch(text(), /No agent cross-market synthesis stored yet/);
  actions.getLatestAgentCrossMarketSynthesis=async()=>({theory:stored,error:null});
  await click("Retry synthesis read");
  assert.match(text(), /Stored thesis/);
  assert.equal(calls.some(c=>c.action==='runTheoryDiscovery'),false);
});
test("server-reported synthesis failure is visible with read-only retry", async t=>{
  await setup(t,{getLatestAgentCrossMarketSynthesis:async()=>({theory:null,error:"database unavailable"})});
  assert.match(text(), /database unavailable/);
  assert.ok(button("Retry synthesis read"));
  assert.doesNotMatch(text(), /No agent cross-market synthesis stored yet/);
});
test("collection completion is visible on Synthesis and refreshes the stored read", async t=>{
  await setup(t,{runTheoryDiscovery:async()=>{
    actions.getLatestAgentCrossMarketSynthesis=async()=>({theory:stored,error:null});
    return {ok:true,status:"complete",message:"Evidence batch 42 collected."};
  }});
  await click("RUN DISCOVERY");
  assert.match(text(), /Evidence batch 42 collected/);
  assert.match(text(), /Stored thesis/);
  assert.match(text(), /does not itself create a synthesis/i);
});
test("degraded collection is visible on Synthesis without manufacturing a theory", async t=>{
  await setup(t,{runTheoryDiscovery:async()=>({ok:false,status:"degraded",message:"Required evidence unavailable"})});
  await click("RUN DISCOVERY");
  assert.match(text(), /Required evidence unavailable/);
  assert.match(text(), /No agent cross-market synthesis stored yet/);
});
test("collection failure is visible and never retried automatically", async t=>{
  await setup(t,{runTheoryDiscovery:async()=>{throw new Error("connection lost");}});
  await click("RUN DISCOVERY");
  assert.match(text(), /connection lost/);
  assert.match(text(), /unconfirmed/i);
  assert.equal(calls.filter(c=>c.action==='runTheoryDiscovery').length,1);
});
test("late collection becomes unconfirmed, survives view remount, then accepts its real result", async t=>{
  const pending=deferred();
  await setup(t,{runTheoryDiscovery:()=>pending.promise});
  t.mock.timers.enable({apis:["setTimeout","Date"]});
  await ui.act(async()=>button("RUN DISCOVERY").click());
  await ui.act(async()=>t.mock.timers.tick(1));
  await ui.act(async()=>t.mock.timers.tick(90001));
  t.mock.timers.reset();
  await flush();
  assert.doesNotMatch(text(), /COLLECTING EVIDENCE/);
  assert.match(text(), /unconfirmed/i);
  await ui.act(async()=>root.unmount());
  await ui.act(async()=>{root=ui.mount(document.getElementById("root"),qc);});
  await flush();
  assert.equal(button("RUN DISCOVERY")?.disabled ?? true,true);
  await click("Check stored results");
  assert.equal(calls.filter(c=>c.action==='runTheoryDiscovery').length,1);
  await ui.act(async()=>pending.resolve({ok:true,status:"complete",message:"Late batch 43 collected"}));
  await flush();
  assert.match(text(), /Late batch 43 collected/);
  assert.equal(button("RUN DISCOVERY").disabled,false);
});
test("synthesis read deadline is bounded and late response cannot overwrite a retry", async t=>{
  const pending=deferred();
  // Enable before mount so the production deadline is on the controlled clock.
  calls=[];
  actions={listTheoryWatch:async()=>({theories:[],runs:[],error:null}),getLatestAgentCrossMarketSynthesis:()=>pending.promise};
  document.body.innerHTML='<div id="root"></div>';
  qc=new ui.QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity},mutations:{gcTime:Infinity}}});
  t.mock.timers.enable({apis:["setTimeout","Date"]});
  await ui.act(async()=>{root=ui.mount(document.getElementById("root"),qc);});
  await ui.act(async()=>t.mock.timers.tick(15001));
  await ui.act(async()=>t.mock.timers.tick(0));
  t.mock.timers.reset();
  await flush();
  t.after(async()=>{await ui.act(async()=>root.unmount());qc.clear();});
  assert.match(text(), /read timed out/i);
  actions.getLatestAgentCrossMarketSynthesis=async()=>({theory:stored,error:null});
  await click("Retry synthesis read");
  await ui.act(async()=>pending.resolve({theory:{...stored,headline:"Superseded response"},error:null}));
  await flush();
  assert.match(text(), /Stored thesis/);
  assert.doesNotMatch(text(), /Superseded response/);
});
test("failed refresh preserves the cached theory and labels it as stored data", async t=>{
  await setup(t,{getLatestAgentCrossMarketSynthesis:async()=>({theory:stored,error:null})});
  actions.getLatestAgentCrossMarketSynthesis=async()=>{throw new Error("refresh failed");};
  await ui.act(async()=>{await qc.invalidateQueries({queryKey:["agent-cross-synthesis"]});});
  await flush();
  assert.match(text(), /Stored thesis/);
  assert.match(text(), /refresh failed/);
  assert.match(text(), /previously loaded/i);
});
