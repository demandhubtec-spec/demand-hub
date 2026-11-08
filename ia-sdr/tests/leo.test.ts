import { test } from "node:test";
import assert from "node:assert/strict";
import { acharCnpjs, cnpjValido, donoDoQsa, escolherCnpj, instagramNaBusca, lerBrasilApi, linksDoTexto, perfilDaPessoa, titulo } from "../src/lib/leo-pistas.ts";
import { consultasPara } from "../src/lib/leo.ts";

test("CNPJ: aceita com e sem pontuação e confere os dígitos", () => {
  assert.equal(cnpjValido("11.222.333/0001-81"), "11222333000181");
  assert.equal(cnpjValido("11222333000182"), null);
  assert.equal(cnpjValido("00000000000000"), null);
  assert.deepEqual(acharCnpjs("Rodapé © 2026 Clínica X · CNPJ 11.222.333/0001-81 · tel 19 99999-9999"), ["11222333000181"]);
});

test("links do texto: site, Instagram, LinkedIn e e-mail; redes sociais não contam como site", () => {
  const l = linksDoTexto("Agende: www.clinicax.com.br | instagram.com/clinicax | contato@clinicax.com.br | https://wa.me/5519999 linkedin.com/company/clinica-x");
  assert.deepEqual(l.sites, ["https://www.clinicax.com.br"]);
  assert.deepEqual(l.instagrams, ["clinicax"]);
  assert.deepEqual(l.emails, ["contato@clinicax.com.br"]);
  assert.deepEqual(l.linkedins, ["https://www.linkedin.com/company/clinica-x"]);
});

const receita = (o: Partial<ReturnType<typeof lerBrasilApi>> = {}) => ({
  cnpj: "11222333000181", razao_social: "SORRISO FELIZ ODONTOLOGIA LTDA", nome_fantasia: "Sorriso Feliz", municipio: "INDAIATUBA", uf: "SP",
  telefone: null, email: null, situacao: "ATIVA", cnae: null, abertura: null, porte: null, socios: [], ...o,
});

test("escolhe o CNPJ da mesma cidade e com nome parecido", () => {
  const certo = receita();
  const outraCidade = receita({ cnpj: "1", municipio: "CAMPINAS" });
  const outroNome = receita({ cnpj: "2", nome_fantasia: "Padaria do Zé", razao_social: "JOSE PAES LTDA" });
  assert.equal(escolherCnpj([outraCidade, outroNome, certo], "Sorriso Feliz Odontologia", "Indaiatuba")?.cnpj, "11222333000181");
  assert.equal(escolherCnpj([outraCidade, outroNome], "Sorriso Feliz Odontologia", "Indaiatuba"), null);
});

test("dono: sócio-administrador primeiro; BrasilAPI vira nosso formato", () => {
  const d = lerBrasilApi({
    cnpj: "11222333000181", razao_social: "X LTDA", municipio: "INDAIATUBA", ddd_telefone_1: "1938751234", email: "CONTATO@X.COM",
    qsa: [{ nome_socio: "JOAO DA SILVA", qualificacao_socio: "Sócio" }, { nome_socio: "MARIA SOUZA", qualificacao_socio: "Sócio-Administrador" }],
  })!;
  assert.equal(d.telefone, "1938751234");
  assert.equal(d.email, "contato@x.com");
  assert.equal(donoDoQsa(d.socios)?.nome, "Maria Souza");
  assert.equal(titulo("JOAO DA SILVA"), "Joao da Silva");
});

test("Instagram da empresa e perfis do dono nos resultados do Google", () => {
  const res = [
    { title: "Outra Clínica (@outra) • Instagram", url: "https://www.instagram.com/outra/" },
    { title: "Sorriso Feliz (@sorrisofeliz.indaiatuba) • Instagram", url: "https://www.instagram.com/sorrisofeliz.indaiatuba/" },
    { title: "Maria Souza - Dentista - Sorriso Feliz | LinkedIn", url: "https://br.linkedin.com/in/maria-souza-123" },
    { title: "Maria Lima | LinkedIn", url: "https://br.linkedin.com/in/maria-lima" },
  ];
  assert.equal(instagramNaBusca(res, "Sorriso Feliz Odontologia"), "https://www.instagram.com/sorrisofeliz.indaiatuba/");
  assert.equal(perfilDaPessoa(res, "Maria Souza", "linkedin"), "https://br.linkedin.com/in/maria-souza-123");
  assert.equal(perfilDaPessoa(res, "Joao da Silva", "linkedin"), null);
});

test("consultas do Léo: só busca o que falta", () => {
  const base = { place_id: "p", empresa: "Sorriso Feliz", cidade: "Indaiatuba", whatsapp: null, site: null, instagram: null, email: null, linkedin_empresa: null, cnpj: null, socios: null, decisor: null, enriquecimento: null };
  assert.deepEqual(consultasPara("busca", base), ['"Sorriso Feliz" Indaiatuba CNPJ', "Sorriso Feliz Indaiatuba instagram"]);
  assert.deepEqual(consultasPara("busca", { ...base, cnpj: "1", instagram: "https://www.instagram.com/x/" }), []);
  assert.deepEqual(consultasPara("busca", { ...base, site: "https://sorrisofeliz.com.br" }), ['"Sorriso Feliz" Indaiatuba CNPJ']);
  assert.deepEqual(consultasPara("perfil", { ...base, instagram: "https://www.instagram.com/sorrisofeliz/" }), ["sorrisofeliz"]);
  assert.deepEqual(consultasPara("dono", { ...base, socios: [{ nome: "Maria Souza", qualificacao: "Sócio-Administrador" }] }), ['"Maria Souza" Indaiatuba linkedin instagram']);
});

test("planilha do Léo: cabeçalho e aspas onde precisa", async () => {
  const { listaEmCsv } = await import("../src/lib/leo-planilha.ts");
  const csv = listaEmCsv([{ empresa: 'Clínica "Boa", Saúde', leo_status: "pendente", cnpj: "11222333000181", socios: [{ nome: "Maria Souza" }], site_fonte: "instagram", site: "https://x.com.br" }]);
  const [cab, linha] = csv.split("\n");
  assert.match(cab, /^Situação na lista,Empresa,/);
  assert.match(linha, /^Aguardando sua aprovação,"Clínica ""Boa"", Saúde",/);
  assert.match(linha, /11\.222\.333\/0001-81/);
  assert.match(linha, /Bio do Instagram/);
});
