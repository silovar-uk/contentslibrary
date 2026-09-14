import { state, subscribe } from "../core/store.js";
import { workFaceMarkup } from "../core/work-face.js";

let frame = 0;
function ensureStyle(){
  if(document.querySelector('link[href="/styles/work-face.css"]')) return;
  const link=document.createElement("link");
  link.rel="stylesheet";
  link.href="/styles/work-face.css";
  document.head.append(link);
}
function decorateContinue(){
  document.querySelectorAll("#readingStrip .reading-card[data-work-id]").forEach((card)=>{
    const work=state.works.get(String(card.dataset.workId||""));
    const main=card.querySelector(".reading-card-main");
    if(!work||!main) return;
    let face=main.querySelector(":scope > .home-cover-frame--continue");
    if(!face){
      face=document.createElement("span");
      face.className="home-cover-frame home-cover-frame--continue";
      face.dataset.shuhariFace="continue";
      main.prepend(face);
    }
    face.innerHTML=workFaceMarkup(work);
  });
}
function decorateLibrary(){
  document.querySelectorAll("#workList .work-card[data-work-id]").forEach((card)=>{
    const work=state.works.get(String(card.dataset.workId||""));
    const main=card.querySelector(".work-card-main");
    if(!work||!main) return;
    let face=main.querySelector(":scope > .work-face-list-thumb");
    if(!face){
      const legacy=main.querySelector(":scope > .work-cover-thumb");
      face=document.createElement("span");
      face.className="work-face-list-thumb";
      face.dataset.shuhariFace="library";
      if(legacy) legacy.replaceWith(face); else main.prepend(face);
    }
    face.innerHTML=workFaceMarkup(work);
  });
}
export function refreshWorkFaceSurfaces(){decorateContinue();decorateLibrary();}
function scheduleRefresh(){cancelAnimationFrame(frame);frame=requestAnimationFrame(refreshWorkFaceSurfaces);}
export function initWorkFaceSurfaces(){ensureStyle();subscribe(scheduleRefresh);scheduleRefresh();}
