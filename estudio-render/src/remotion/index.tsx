import { Composition, registerRoot } from "remotion";
import { Lamina } from "./Lamina";
import { Reels, FPS, duracaoTotal } from "./Reels";
import { MARCA_PADRAO, type PropsLamina, type PropsReels } from "./tipos";

const lamina: PropsLamina = { tipo: "destaque", titulo: "Seu WhatsApp *perde paciente* todo dia", texto: "Teste de lâmina.", numero: 2, pagina: "2/8", marca: MARCA_PADRAO };
const reels: PropsReels = { cenas: [{ texto: "Teste do *reels*", segundos: 3 }], palavra: "DEMO", marca: MARCA_PADRAO };

function Raiz() {
  return (
    <>
      <Composition id="Lamina" component={Lamina} width={1080} height={1350} fps={FPS} durationInFrames={1} defaultProps={lamina} />
      <Composition
        id="Reels"
        component={Reels}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={FPS * 3}
        defaultProps={reels}
        calculateMetadata={({ props }) => ({ durationInFrames: duracaoTotal(props.cenas) })}
      />
    </>
  );
}

registerRoot(Raiz);
