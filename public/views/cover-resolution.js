import { $ } from "../core/dom.js";
import { coverDisplayUrl } from "../core/cover.js";

let observer = null;
let initialized = false;

function upgradeDetailCover() {
  const image = $("#detailPanel .detail-cover-image");
  if (!image) return;
  const next = coverDisplayUrl(image.currentSrc || image.src);
  if (next && image.src !== next) image.src = next;
}

export function initCoverResolution() {
  if (initialized) return;
  initialized = true;
  const panel = $("#detailPanel");
  if (!panel) return;
  observer = new MutationObserver(upgradeDetailCover);
  observer.observe(panel, { childList: true, subtree: true });
  requestAnimationFrame(upgradeDetailCover);
}
