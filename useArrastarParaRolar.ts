import * as React from "react";

/**
 * Arrastar para rolar: segurando o mouse em qualquer parte vazia do quadro, dá para puxar a visão
 * para os lados (rola o quadro) e para cima e para baixo (rola a página), sem usar a barra de rolagem.
 * Cards arrastáveis, botões, links e campos continuam funcionando normalmente.
 */
export function useArrastarParaRolar<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ativo = false;
    let x = 0;
    let y = 0;
    const ignora = (t: EventTarget | null) => t instanceof Element && !!t.closest('[draggable="true"], button, a, input, textarea, select, label');
    const rolavel = (): HTMLElement | Window => {
      let p: HTMLElement | null = el.parentElement;
      while (p) {
        const o = getComputedStyle(p).overflowY;
        if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
        p = p.parentElement;
      }
      return window;
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || ignora(e.target)) return;
      ativo = true;
      x = e.clientX;
      y = e.clientY;
      el.style.cursor = "grabbing";
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (!ativo) return;
      el.scrollLeft -= e.clientX - x;
      rolavel().scrollBy(0, -(e.clientY - y));
      x = e.clientX;
      y = e.clientY;
    };
    const up = () => {
      ativo = false;
      el.style.cursor = "";
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);
  return ref;
}
