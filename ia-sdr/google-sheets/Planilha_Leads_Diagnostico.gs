/**
 * Planilha de leads da landing page do diagnóstico (demandhub.com.br/diagnostico).
 * Recebe cada cadastro do servidor da IA SDR, grava uma linha na aba "Leads"
 * e manda um e-mail de aviso para o Kelvin.
 *
 * Instalação: Extensões > Apps Script > colar este código > Implantar > Nova implantação
 * > Tipo: App da Web > Executar como: Eu > Quem pode acessar: Qualquer pessoa.
 * A URL gerada vai na Vercel em SHEET_WEBHOOK_URL.
 */
const SECRET = "COLE_AQUI_O_SHEET_WEBHOOK_SECRET"; // igual a SHEET_WEBHOOK_SECRET na Vercel
const EMAIL = "kelvin.zatekeipinheiro10@gmail.com";
const ABA = "Leads";
const COLUNAS = ["Data","Nome","WhatsApp","E-mail","Empresa","Segmento","Cargo","Faturamento mensal","Equipe",
  "Como os clientes chegam","Investe em marketing","Maiores gargalos","Tempo de resposta","Quando quer resolver",
  "Maior desafio","BANT (formulário)","Status","utm_source","utm_medium","utm_campaign","utm_content","utm_term",
  "fbclid","gclid","Página de entrada","Abrir conversa","ID"];

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: "json" }); }
  if (!data || data.secret !== SECRET) return json({ ok: false, error: "unauthorized" });
  const row = data.row || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = aba();
    sh.appendRow(COLUNAS.map(function (c) { return c === "Status" ? "Novo" : (row[c] == null ? "" : String(row[c])); }));
  } finally {
    lock.releaseLock();
  }
  try { avisar(row, data.origem || ""); } catch (err) { console.error(err); }
  return json({ ok: true });
}

function doGet() { return json({ ok: true, planilha: "leads diagnóstico DemandIA" }); }

function aba() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(ABA);
  if (!sh) {
    sh = ss.getSheets()[0];
    sh.setName(ABA);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(COLUNAS);
    const h = sh.getRange(1, 1, 1, COLUNAS.length);
    h.setFontWeight("bold").setBackground("#6E3AFF").setFontColor("#FFFFFF");
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, COLUNAS.length, 160);
    const status = SpreadsheetApp.newDataValidation()
      .requireValueInList(["Novo", "Em conversa", "Reunião marcada", "Diagnóstico entregue", "Cliente", "Fora do perfil", "Sem resposta"], true).build();
    sh.getRange(2, COLUNAS.indexOf("Status") + 1, 999, 1).setDataValidation(status);
  }
  return sh;
}

function avisar(r, origem) {
  const linhas = [
    ["Empresa", r["Empresa"] + " (" + (r["Segmento"] || "-") + ")"],
    ["Cargo", r["Cargo"]],
    ["WhatsApp", r["WhatsApp"]],
    ["E-mail", r["E-mail"]],
    ["Faturamento", r["Faturamento mensal"]],
    ["Equipe", r["Equipe"]],
    ["Clientes chegam por", r["Como os clientes chegam"]],
    ["Investe em marketing", r["Investe em marketing"]],
    ["Maiores gargalos", r["Maiores gargalos"]],
    ["Tempo de resposta", r["Tempo de resposta"]],
    ["Quando quer resolver", r["Quando quer resolver"]],
    ["Maior desafio", r["Maior desafio"] || "-"],
    ["BANT pelo formulário", r["BANT (formulário)"]],
    ["Origem", origem],
  ];
  const tabela = linhas.map(function (l) {
    return '<tr><td style="padding:6px 12px 6px 0;color:#6B5FA5;white-space:nowrap;vertical-align:top">' + l[0] +
      '</td><td style="padding:6px 0;color:#0B0420;font-weight:600">' + esc(l[1]) + "</td></tr>";
  }).join("");
  const html =
    '<div style="font-family:Arial,sans-serif;max-width:560px">' +
    '<div style="background:#6E3AFF;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold">Novo diagnóstico: ' + esc(r["Nome"]) + "</div>" +
    '<div style="border:1px solid #E1D8FA;border-top:0;padding:16px 20px;border-radius:0 0 12px 12px">' +
    '<table style="border-collapse:collapse;font-size:14px">' + tabela + "</table>" +
    '<p style="margin:18px 0 6px"><a href="' + r["Abrir conversa"] + '" style="background:#25D366;color:#05230F;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Abrir conversa no WhatsApp</a></p>' +
    '<p style="color:#6B5FA5;font-size:12px;margin-top:14px">A IA da DemandIA já está chamando o lead no WhatsApp. Planilha: ' +
    '<a href="' + SpreadsheetApp.getActiveSpreadsheet().getUrl() + '">abrir</a></p></div></div>';
  MailApp.sendEmail({
    to: EMAIL,
    subject: "Novo diagnóstico: " + r["Nome"] + " · " + r["Empresa"] + " · " + r["Faturamento mensal"],
    htmlBody: html,
    name: "DemandIA · Leads",
  });
}

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Rode uma vez pelo editor para autorizar planilha e e-mail e conferir o formato. */
function teste() {
  aba();
  avisar({ Nome: "Teste", Empresa: "Empresa Teste", Segmento: "Clínica", "Faturamento mensal": "R$ 50 a 100 mil", WhatsApp: "+5519999999999", "Abrir conversa": "https://wa.me/5519999999999" }, "teste");
}
