import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 420, height: 900 } });
const errs=[]; p.on("pageerror",e=>errs.push(String(e.message)));
await p.goto("http://localhost:3000/minigame",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(4000);
for (let i=0;i<6;i++){ const s=p.getByText("건너뛰기").first(); if(await s.count()){await s.click().catch(()=>{});await p.waitForTimeout(300);} else break; }
await p.getByText("골드 테트리스").first().click({timeout:5000}).catch(()=>{});
await p.waitForTimeout(600);
// spam: alternate move+rotate+harddrop to fill board and lock many pieces
for (let i=0;i<40;i++){
  const k = ["ArrowLeft","ArrowRight","ArrowUp","ArrowLeft","ArrowLeft","ArrowRight","ArrowRight"][i%7];
  await p.keyboard.press(k); await p.waitForTimeout(30);
  await p.keyboard.press(" "); // hard drop -> lock
  await p.waitForTimeout(90);
}
const txt = await p.evaluate(()=>document.body.innerText);
const colored = await p.evaluate(()=>{
  const grid=[...document.querySelectorAll('div')].find(d=>d.style.gridTemplateColumns && d.style.gridTemplateColumns.includes('repeat(10'));
  if(!grid) return -1;
  return [...grid.children].filter(c=>{const bg=c.style.background; return bg && bg!=='var(--surface)' && bg!=='transparent';}).length;
});
console.log("board has locked cells or game over:", colored>0 || /게임 종료/.test(txt));
console.log("shows result or still playing (점수):", /점수/.test(txt));
console.log("pageerrors:", errs.length, errs.slice(0,3).join(" | "));
await b.close();
