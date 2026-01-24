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
        console.log(`✅ ${storeId}.xml gerado.`);
    } catch (e) {
        console.error(`❌ Erro em ${storeId}:`, e.message);
    }
}

async function run() {
    try {
        const registryResp = await fetch(`${BASE_URL}/stores_registry?pageSize=500`);
        if (!registryResp.ok) throw new Error("Falha ao acessar Registry do Firestore");
        
        const registryData = await registryResp.json();
        const storeIds = registryData.documents ? registryData.documents.map(d => d.name.split('/').pop()) : ['dandan'];

        // Processa as lojas em paralelo
        await Promise.all(storeIds.map(async (storeId) => {
            try {
                const configResp = await fetch(`${BASE_URL}/stores/${storeId}/config/store`);
                const configData = await configResp.json();
                if (!configData.fields) return;

                const fields = configData.fields;
                const planFields = fields.plan?.mapValue?.fields || {};
                const pId = (planFields.planId?.stringValue || fields.planId?.stringValue || "").trim().toLowerCase();
                
                if (storeId === 'dandan' || pId.includes("profissional") || pId.includes("beta")) {
                    await generateXml(storeId, fields.storeName?.stringValue || storeId);
                }
            } catch (err) { console.error(`Erro config ${storeId}:`, err.message); }
        }));

        console.log("🚀 Fim do processamento.");
    } catch (e) {
        console.error("💥 Erro Fatal:", e);
        process.exit(1);
    }
}

run();
