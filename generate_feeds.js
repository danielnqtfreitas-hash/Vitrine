const fs = require('fs');

const PROJECT_ID = "meuestoque-1badc";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function clean(text) {
    if (!text) return "";
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

async function generateXml(storeId, storeName) {
    try {
        const resp = await fetch(`${BASE_URL}/stores/${storeId}/products?pageSize=1000`);
        const data = await resp.json();
        
        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>${clean(storeName)}</title>
  <link>https://loja.vitrineonline.app.br/${storeId}</link>
  <description>Feed de Produtos - ${clean(storeName)}</description>`;

        if (data.documents) {
            data.documents.forEach(doc => {
                const f = doc.fields;
                if (f.status?.stringValue !== 'active') return;

                const id = doc.name.split('/').pop();
                const name = f.name?.stringValue || '';
                const desc = f.description?.stringValue || name;
                const price = parseFloat(f.value?.doubleValue || f.value?.integerValue || 0).toFixed(2);
                const img = f.images?.arrayValue?.values?.[0]?.stringValue || '';
                const prodLink = `https://loja.vitrineonline.app.br/${storeId}?id=${id}`;

                xml += `
  <item>
    <g:id>${id}</g:id>
    <g:title>${clean(name)}</g:title>
    <g:description>${clean(desc)}</g:description>
    <g:link>${clean(prodLink)}</g:link>
    <g:image_link>${clean(img)}</g:image_link>
    <g:condition>new</g:condition>
    <g:availability>in stock</g:availability>
    <g:price>${price} BRL</g:price>
    <g:brand>${clean(storeName)}</g:brand>
  </item>`;
            });
        }

        xml += `\n</channel>\n</rss>`;
        fs.writeFileSync(`./${storeId}.xml`, xml);
        console.log(`✅ Arquivo ${storeId}.xml gerado com sucesso.`);
    } catch (e) {
        console.error(`❌ Erro ao gerar XML da loja ${storeId}:`, e.message);
    }
}

async function run() {
    try {
        console.log("🔍 Iniciando varredura de lojas...");
        const registryResp = await fetch(`${BASE_URL}/stores_registry?pageSize=500`);
        if (!registryResp.ok) throw new Error("Não foi possível acessar a lista de lojas.");
        
        const registryData = await registryResp.json();
        const storeIds = registryData.documents ? registryData.documents.map(d => d.name.split('/').pop()) : ['dandan'];

        for (const storeId of storeIds) {
            try {
                const configResp = await fetch(`${BASE_URL}/stores/${storeId}/config/store`);
                const configData = await configResp.json();
                
                if (!configData.fields) {
                    console.log(`⚠️ Loja ${storeId} sem configuração válida. Pulando...`);
                    continue;
                }

                const fields = configData.fields;
                const planFields = fields.plan?.mapValue?.fields || {};
                const pId = (planFields.planId?.stringValue || fields.planId?.stringValue || "").trim().toLowerCase();
                
                // Mantendo sua lógica de filtro por plano
                if (storeId === 'dandan' || pId.includes("profissional") || pId.includes("beta")) {
                    await generateXml(storeId, fields.storeName?.stringValue || storeId);
                } else {
                    console.log(`ℹ️ Loja ${storeId} ignorada (Plano: ${pId || 'gratuito'}).`);
                }
            } catch (err) {
                console.error(`❌ Erro ao processar config da loja ${storeId}:`, err.message);
            }
        }
        console.log("🚀 Processamento finalizado!");
    } catch (e) {
        console.error("💥 Erro crítico no robô:", e);
        process.exit(1);
    }
}

run();
