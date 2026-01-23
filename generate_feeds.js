const fs = require('fs');

const PROJECT_ID = "meuestoque-1badc";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function run() {
    try {
        console.log("🔍 Iniciando Varredura de Lojas...");
        
        let storeIds = [];
        const registryResp = await fetch(`${BASE_URL}/stores_registry?pageSize=500`);
        const registryData = await registryResp.json();

        if (registryData.documents) {
            storeIds = registryData.documents.map(d => d.name.split('/').pop());
            console.log(`📂 Lojas encontradas: ${storeIds.join(', ')}`);
        } else {
            storeIds = ['dandan']; 
        }

        for (const storeId of storeIds) {
            await processStore(storeId);
        }

    } catch (e) {
        console.error("💥 Erro crítico:", e);
    }
}

async function processStore(storeId) {
    try {
        const configResp = await fetch(`${BASE_URL}/stores/${storeId}/config/store`);
        const configData = await configResp.json();

        if (!configData.fields) return;

        const fields = configData.fields;
        const planFields = fields.plan?.mapValue?.fields || {};
        const pId = (planFields.planId?.stringValue || fields.planId?.stringValue || "").trim().toLowerCase();
        const storeName = fields.storeName?.stringValue || storeId;
        const subStatus = (fields.subscriptionStatus?.stringValue || "").toLowerCase();

        const eDandan = storeId.toLowerCase() === 'dandan';
        const ePro = pId.includes("profissional") || pId.includes("beta") || pId.includes("xqes739tk");
        const estaAtivo = subStatus !== 'suspended';

        if (eDandan || (ePro && estaAtivo)) {
            console.log(`✅ Gerando XML para: ${storeName}`);
            await generateXml(storeId, storeName);
        }
    } catch (err) {
        console.log(`Erro em ${storeId}:`, err.message);
    }
}

async function generateXml(storeId, storeName) {
    const productsUrl = `${BASE_URL}/stores/${storeId}/products?pageSize=1000`;
    try {
        const resp = await fetch(productsUrl);
        const data = await resp.json();
        
        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title><![CDATA[${storeName}]]></title>
  <link>https://loja.vitrineonline.app.br/${storeId}</link>
  <description><![CDATA[Feed de Produtos - ${storeName}]]></description>`;

        if (data.documents && data.documents.length > 0) {
            data.documents.forEach(doc => {
                const f = doc.fields;
                if (f.status?.stringValue !== 'active') return;

                const id = doc.name.split('/').pop();
                const price = parseFloat(f.value?.doubleValue || f.value?.integerValue || 0).toFixed(2);
                const img = f.images?.arrayValue?.values?.[0]?.stringValue || '';
                const link = `https://loja.vitrineonline.app.br/${storeId}?id=${id}`;

                // A MUDANÇA ESTÁ AQUI: CDATA PROTEGENDO OS LINKS
                xml += `
  <item>
    <g:id>${id}</g:id>
    <g:title><![CDATA[${f.name?.stringValue || ''}]]></g:title>
    <g:description><![CDATA[${f.description?.stringValue || f.name?.stringValue || ''}]]></g:description>
    <g:link><![CDATA[${link}]]></g:link>
    <g:image_link><![CDATA[${img}]]></g:image_link>
    <g:condition>new</g:condition>
    <g:availability>in stock</g:availability>
    <g:price>${price} BRL</g:price>
    <g:brand><![CDATA[${storeName}]]></g:brand>
  </item>`;
            });
        }

        xml += `\n</channel>\n</rss>`;
        fs.writeFileSync(`./${storeId}.xml`, xml);
        console.log(`📦 Arquivo [${storeId}.xml] salvo!`);
    } catch (e) {
        console.error(`Erro no XML de ${storeId}:`, e);
    }
}

run();
