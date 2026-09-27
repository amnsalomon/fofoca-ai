# Fofoca Aí!

Página de notícias de artistas, pensada primeiro para celular, com leitura confortável, fontes visíveis e compartilhamento pelo WhatsApp. Usa **gpt-5.6-luna** com pesquisa real na web pela Responses API.

## Nome e chamada

**Fofoca Aí!** coloca a curiosidade em primeiro lugar, sem exigir que a visitante entenda inteligência artificial. Chamada principal: **“Quer uma fofoca?”**. Botão: **“Me conta!”**. Apoio: **“Fofoca boa tem fonte.”** A marca usa “fofoca” como convite; o conteúdo continua limitado a notícias publicadas e atribuídas. Não promete informações exclusivas, vazamentos ou fatos não confirmados.

Sugestão para o banner no site da loja: **“Quer uma fofoca? Veja o que saiu sobre seu artista favorito. Me conta!”**

## O que está pronto

- Página estática em `docs/`, sem framework ou dependências no navegador.
- Busca por nome e seis sugestões de artistas.
- Até três notícias com data de publicação, resumo e links das fontes.
- Mensagens honestas quando não há novidade, o nome é ambíguo ou o serviço está indisponível.
- Compartilhamento no WhatsApp e cópia da notícia.
- Painel público e sem link na página principal, em **`c7m2/`**.
- Serviço Cloudflare Worker, chave secreta, cache, limite diário global e indicadores persistentes.
- Workflows para verificar o projeto e publicar no GitHub Pages e Cloudflare.

**Estado da publicação:** página e painel publicados no GitHub Pages. Oito testes de serviço passaram também no GitHub Actions. A chamada real à OpenAI e a coleta de indicadores dependem da configuração da chave e da ativação do Worker; essa etapa ainda está pendente. Não há notícias ou métricas fictícias na página pública.

## Como funciona a chave secreta

O GitHub Pages entrega HTML, CSS e JavaScript. A visitante chama o Worker, que pesquisa na OpenAI e devolve apenas as notícias. **A chave nunca vai para o navegador.**

```text
Página no GitHub Pages → Cloudflare Worker → OpenAI Responses + web_search
```

Todo o código fica no mesmo repositório. A execução da API e dos indicadores acontece na Cloudflare, porque GitHub Pages não executa código de servidor. É necessário ter uma conta Cloudflare para ativar essa parte. O uso da API OpenAI é cobrado na conta da chave, separadamente de qualquer assinatura do ChatGPT.

## Publicação da página

Repositório: **`amnsalomon/fofoca-ai`**.

1. Crie o repositório e envie **todo o conteúdo desta pasta**, incluindo `.github/`, para a branch `main`. Não envie somente `docs/` e não coloque outra pasta `fofoca-ai/` acima dos arquivos.
2. No repositório, abra **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Em **Actions**, execute **Publicar página**. Futuras alterações na `main` também publicam a página automaticamente.
4. Acompanhe o workflow até terminar. A URL real aparece no ambiente `github-pages`.

Endereços publicados e conferidos:

- Página: `https://amnsalomon.github.io/fofoca-ai/`
- Painel: `https://amnsalomon.github.io/fofoca-ai/c7m2/`

O deploy da página foi concluído pelo workflow **Publicar página**. O painel abre, mas só passará a receber dados depois de conectar o serviço.

Sem o serviço conectado, a interface abre normalmente e mostra que a pesquisa está em preparação. Não simula uma resposta nem pede chave à visitante.

## Ativar o serviço de notícias

### 1. Publicar o Worker a partir do repositório

O workflow **Publicar serviço de notícias** já está incluído. Na conta Cloudflare, obtenha um token com permissão para editar Workers na conta escolhida e o Account ID. No GitHub, em **Settings → Secrets and variables → Actions → Secrets**, adicione:

| Nome | Valor |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Token da Cloudflare com permissão de publicação de Workers na conta |
| `CLOUDFLARE_ACCOUNT_ID` | ID da conta Cloudflare |

Execute **Actions → Publicar serviço de notícias → Run workflow**. O Worker será `fofoca-ai-api`. O Durable Object com SQLite é criado pela migração declarada no próprio projeto; não é necessário banco externo nem executar SQL manualmente.

Alternativa pelo computador, com Node.js instalado e login na Cloudflare:

```bash
npx wrangler login
npx wrangler deploy
```

### 2. Onde colocar a chave da OpenAI

**Cloudflare → Workers & Pages → fofoca-ai-api → Settings → Variables and Secrets → Add.**

- Tipo: **Secret**.
- Nome: **`OPENAI_API_KEY`**.
- Valor: sua chave da OpenAI.
- Salve/aplique a alteração conforme o painel solicitar.

Ela não deve ser colocada em `docs/config.js`, no HTML, no repositório ou como variável pública de build. Não é preciso enviar a chave por conversa.

Alternativa via terminal, com entrada interativa:

```bash
npx wrangler secret put OPENAI_API_KEY
```

Confirme que o projeto da chave possui crédito, acesso ao modelo `gpt-5.6-luna` e permissão para usar a Responses API. O código mantém exatamente o modelo solicitado, sem trocar silenciosamente por outro modelo.

### 3. Conectar a página ao Worker

Depois da publicação, copie a URL HTTPS real do Worker. No GitHub, abra **Settings → Secrets and variables → Actions → Variables** e crie:

| Nome | Valor |
| --- | --- |
| `PUBLIC_API_BASE_URL` | A origem HTTPS do Worker, por exemplo o endereço `*.workers.dev` exibido pela Cloudflare, sem `/api/news` e sem chave |

Execute novamente **Publicar página**. A mesma configuração conecta o painel de indicadores.

`wrangler.jsonc` já permite a origem `https://amnsalomon.github.io`. Se usar um domínio próprio, ajuste `ALLOWED_ORIGINS`, publique novamente o Worker e inclua a origem da API em `connect-src` nas duas páginas HTML caso também personalize o domínio da API. O configurador automático aceita apenas origens `*.workers.dev` por padrão.

## Painel `/c7m2/`

O caminho é discreto, não é exibido no menu da página e tem `noindex`. **O painel é público por solicitação: o caminho não equivale a senha.** A API de métricas também fornece apenas agregados. Não aparecem IPs, identificadores de navegador ou chaves.

| Indicador | Como é contado |
| --- | --- |
| Visitantes estimados | Navegadores únicos por dia, somados no período. A mesma pessoa pode contar em outro dia/aparelho. |
| Visitas | Carregamentos da página principal; recarregar também conta. |
| Começou a digitar | Uma vez por abertura da página, ao digitar pelo menos dois caracteres. |
| Clicou em sugestão | Cliques nos nomes sugeridos. |
| Buscas | Pesquisas válidas aceitas pelo serviço; inclui respostas em cache. |
| Busca com notícias | Resposta com pelo menos uma notícia validada. |
| Busca sem novidade | Não encontrou notícia recente válida, nome ambíguo ou fora do escopo. |
| Busca indisponível | Falha de pesquisa ou limite global atingido; bloqueios por excesso de IP não entram aqui. |
| Cliques nas fontes | Clique para abrir a matéria; não comprova leitura no site de destino. |
| Cliques no WhatsApp | Abertura do compartilhamento; não comprova envio da mensagem. |
| Notícias copiadas | Cópia concluída no navegador. |
| Artistas mais consultados | Nomes públicos reconhecidos nas buscas que retornaram notícias. |
| Chamadas à OpenAI | Tentativas reservadas no serviço, inclusive falhas. |
| Respostas reaproveitadas | Respostas vindas de cache ou de uma pesquisa simultânea já em andamento. |

Períodos: hoje, últimos 7 dias, últimos 30 dias, mês atual, mês anterior e intervalo personalizado de até 90 dias. Datas e indicadores usam **America/Sao_Paulo**. Não há atualização automática: o botão Atualizar evita consultas desnecessárias. A visita ao painel não entra na contagem da página.

Não armazenamos o nome digitado como evento de análise nem URLs de origem da visitante. O ranking registra apenas o nome canônico reconhecido nas respostas com notícias. O identificador aleatório no navegador muda por dia; no servidor, ele e o IP viram hashes temporários com chave, removidos em até aproximadamente 25 horas. Agregados ficam 90 dias. A infraestrutura pode possuir registros técnicos próprios. Bloqueadores, robôs, usuários sem armazenamento local e falhas de conexão afetam a precisão.

## Consumo e segurança

- Limite padrão: **200 novas chamadas à OpenAI por dia**, para o site todo. Altere `DAILY_API_LIMIT` em `wrangler.jsonc` e publique o Worker.
- Cada resposta permite até 3 chamadas da ferramenta web e no máximo 4.500 tokens de saída. Esse limite é de chamadas, **não um teto exato em reais**. Configure também os controles de uso disponíveis na sua conta OpenAI.
- Cache compartilhado de uma hora para notícias e cinco minutos para resultados vazios. Requisições simultâneas do mesmo nome reaproveitam uma única consulta.
- Limite padrão de 30 buscas por minuto por IP, configurável em `IP_SEARCHES_PER_MINUTE`.
- Orçamento diário e métricas ficam em armazenamento persistente; reiniciar o Worker não zera as contagens.
- CORS por origem, entrada limitada a 2 KB, validação de nome e resposta, SQL parametrizado, timeouts e mensagens de erro sem detalhes internos.
- CORS não é autenticação contra robôs. O teto global limita o número de novas consultas, mas um robô pode consumir essa cota e indisponibilizar novas pesquisas. Para tráfego maior, considere Turnstile e regras de proteção da Cloudflare.
- O serviço exige pesquisa concluída e aceita apenas links HTTPS presentes nas fontes/citações realmente retornadas pela ferramenta. Filtra datas inválidas, futuras e publicações fora de 30 dias. Isso reduz conteúdo sem suporte, mas não prova por si só a veracidade de cada afirmação; o leitor sempre recebe a fonte para conferir.
- O navegador usa `textContent` para textos dinâmicos. Não injeta HTML produzido pelo modelo.
- Não há pixels, anúncios, cookies de marketing ou armazenamento de chave no navegador.

## Desenvolvimento e verificação

Node.js 24 ou superior:

```bash
npm test
npm run check
npm run serve
```

`npm test` executa oito testes com SQLite real em memória e chamadas OpenAI simuladas: validação de entrada; modelo e pesquisa obrigatória; fontes e datas; CORS; limites; cache; concorrência; orçamento persistente; indicadores; limpeza de identificadores; tratamento de falhas.

`npm run check` verifica sintaxe JavaScript, arquivos locais referenciados e padrões comuns de chave nos arquivos públicos. Não é auditoria completa nem verificação visual.

`npm run serve` abre a página local na porta 4173; precisa de Python 3. Para testar o Worker localmente, use Wrangler, uma chave de projeto de teste em `.dev.vars` (ignorado pelo Git) e ajuste explicitamente a origem permitida. Não relaxe o HTTPS/CSP da publicação para testes locais.

Verificação em navegador concluída para a página publicada em desktop, carregamento da imagem, busca em estado de preparação, aviso de privacidade e filtro personalizado do painel. A visualização mobile foi implementada em CSS, mas não foi emulada nesta verificação. Ainda é necessário publicar o Worker, fazer uma consulta real, conferir as fontes e checar se visita, busca e clique aparecem no painel. A API experimental WebMCP não foi validada em contexto compatível.

## Arquivos

- `docs/`: somente arquivos públicos que serão publicados no Pages.
- `docs/c7m2/`: painel agregado.
- `docs/config.js`: endereço público do serviço, nunca uma chave.
- `worker/`: serviço OpenAI, cache, limites e indicadores.
- `wrangler.jsonc`: configuração e migração do Worker.
- `.github/workflows/`: publicação e verificação.
- `tests/`: verificações com dados fictícios identificados como teste.

A ilustração é original, gerada para o projeto. Não representa artistas reais. As notícias são resumos curtos, com encaminhamento ao veículo original.

## Documentação de referência

- [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [Pesquisa na web da OpenAI](https://developers.openai.com/api/docs/guides/tools-web-search)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- [Secrets de Cloudflare Workers](https://developers.cloudflare.com/workers/configuration/secrets/)
- [SQLite em Durable Objects](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
