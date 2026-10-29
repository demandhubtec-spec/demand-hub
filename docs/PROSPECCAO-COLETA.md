# Coleta de leads (Apify) → Prospecção Ativa

Instruções para o agente de coleta, que roda o Apify **Google Maps Scraper** (`compass/crawler-google-places`) e envia os leads ao portal.

## Para onde enviar
`POST https://portal.demandhub.com.br/api/prospeccao/leads`
Header: `Authorization: Bearer <PROSPECCAO_IMPORT_TOKEN>` (secret no Supabase; sem ele, vale o `OUTREACH_API_SECRET`).

Antes de rodar o Apify, consulte o orçamento: `GET https://portal.demandhub.com.br/api/prospeccao/orcamento` (teto de US$ 4/mês).

**Reenviar um lead que já existe não duplica.** Os campos do perfil (nota, fotos, posição etc.) são completados nele, e o status de envio nunca muda. Então dá para rodar de novo nos 60 leads atuais só para completar o diagnóstico.

## Configuração do Apify
- `searchStringsArray`: um termo por nicho e cidade, do jeito que o cliente busca. Exemplos: `"dentista Indaiatuba"`, `"clínica odontológica Campinas"`, `"advogado trabalhista Campinas"`.
- `maxCrawledPlacesPerSearch`: de 20 a 40, para termos a posição de cada empresa entre os concorrentes.
- `maxReviews`: 10, para medir se o dono responde às avaliações.
- `scrapeContacts` / enriquecimento de redes sociais: ligado, para pegar Instagram e e-mail.

## Mapeamento dos campos

| Apify (item do resultado) | Enviar como | Observação |
|---|---|---|
| `placeId` | `place_id` | obrigatório |
| `title` | `empresa` | obrigatório |
| `city` | `cidade` | |
| (nicho da busca) | `nicho` | use exatamente um destes: Clínica médica, Odontologia, Advocacia, Imobiliária, Pet shop / Veterinária, Endocrinologia |
| `address` | `endereco` | |
| `phone` | `telefone` | |
| celular do WhatsApp (se houver) | `whatsapp` | 55 + DDD + 9 dígitos começando com 9; fixo não vale |
| `emails[0]` | `email` | |
| `website` | `site` | |
| `instagrams[0]` | `instagram` | |
| `reviewsCount` | `avaliacoes` | |
| `totalScore` | `nota` | ex.: 4.8 |
| `imagesCount` | `fotos` | |
| `categoryName` | `categoria` | |
| `description` preenchido? | `tem_descricao` | true/false |
| `openingHours` com itens? | `tem_horario` | true/false |
| % de `reviews[]` com `responseFromOwnerText` | `responde_avaliacoes` | 0 a 100 |
| `searchString` | `termo_busca` | ex.: "dentista Indaiatuba" |
| `rank` | `posicao_busca` | posição da empresa no resultado da busca |
| total de itens daquela busca | `total_busca` | |

Corpo de exemplo:
```json
{
  "coleta": { "cidades": ["Indaiatuba"], "nichos": ["Odontologia"], "lugares_coletados": 30, "custo_usd": 0.12 },
  "leads": [{
    "place_id": "ChIJ...", "empresa": "Clínica X", "cidade": "Indaiatuba", "nicho": "Odontologia",
    "whatsapp": "5519999999999", "site": "https://...", "instagram": "https://instagram.com/...",
    "avaliacoes": 230, "nota": 4.7, "fotos": 18, "categoria": "Dentista",
    "tem_descricao": false, "tem_horario": true, "responde_avaliacoes": 20,
    "termo_busca": "dentista Indaiatuba", "posicao_busca": 7, "total_busca": 30,
    "prioridade": "Alta"
  }]
}
```

## O que acontece depois
1. O lead entra na fila do portal (**Comercial > Prospecção ativa**).
2. Na aba **Aprovação**, o botão **Gerar mensagens** monta o diagnóstico (posição frente aos concorrentes, pontos fortes e oportunidades) e a Ana escreve a primeira mensagem.
3. O Kelvin aprova, edita ou pula cada uma. O robô só envia as aprovadas, dentro da janela e do teto diário.
