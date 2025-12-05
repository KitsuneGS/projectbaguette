import { w as head, x as slot, y as attr } from "../../chunks/index.js";
function _layout($$renderer, $$props) {
  head("12qhfyh", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>Project Baguette</title>`);
    });
    $$renderer2.push(`<link rel="icon"${attr("href", favicon)}/>`);
  });
  $$renderer.push(`<!--[-->`);
  slot($$renderer, $$props, "default", {});
  $$renderer.push(`<!--]-->`);
}
export {
  _layout as default
};
