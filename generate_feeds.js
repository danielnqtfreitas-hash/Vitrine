const fs = require('fs');

const PROJECT_ID = "meuestoque-1badc";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function run() {
    try {
        console.log("🔍 Iniciando Varredura Automática de Lojas...");

        // 1. Busca TODAS as lojas da coleção (o Firebase retornará uma lista)
        const storesResponse = await fetch(`${BASE_URL}/stores?pageSize=500`);
        const storesData = await storesResponse.json();

        if (!storesData.documents || storesData.documents.length === 0) {
            console.log("⚠️ Nenhuma loja listada. Verifique as Regras de Segurança do Firestore (allow list: if true).");
            return;
        }

        console.log(`📂 Encontradas ${storesData.documents.length} lojas. Filtrando quem é Profissional/Beta...`);

        for (const storeDoc of storesData.documents) {
            const storeId = storeDoc.name.split('/').pop();
            
            // 2. Acessa a configuração de cada loja encontrada
            const configResp = await fetch(`${BASE_URL}/stores/${storeId}/config/store`);
            const configData = await configResp.json();

            if (!configData.fields) continue;

            const fields = configData.fields;
            const planFields = fields.plan?.mapValue?.fields || {};
            
            // Identificação do Plano
            const pId = (planFields.planId?.stringValue || fields.planId?.stringValue || "").trim().toLowerCase();
            const pName = (planFields.name?.stringValue || fields.name?.stringValue || "").trim().toLowerCase();
            const storeName = fields.storeName?.stringValue || storeId;
            const status = (fields.subscriptionStatus?.stringValue || "").toLowerCase();

            // REGRA: dandan sempre passa, outros só se forem Profissional/Beta e ativos
            const eDandan = storeId.toLowerCase() === 'dandan';
            const ePlanoValido = pId.includes("profissional") || pId.includes("beta") || pName.includes("profissional");
            const estaAtivo = status !== 'suspended';

            if (eDandan || (ePlanoValido && estaAtivo)) {
                console.log(`✅ Aprovada: ${storeName} [${storeId}]`);
                await generateXml(storeId, storeName);
            }
        }
    } catch (e) {
        console.error("💥 Erro durante a varredura:", e);
    }
}

async function generateXml(storeId, storeName) {
    // Busca até 1000 produtos da loja aprovada
    const productsUrl = `${BASE_URL}/stores/${storeId}/products?pageSize=1000`;
    try {
        const resp = await fetch(productsUrl);
        const data = await resp.json();
        
        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title><![CDATA[${storeName}]]></title>
  <link>https://loja.vitrineonline.app.br/${storeId}</link>
  <description>Vitrine Digital - ${storeName}</description>`;

        if (data.documents && data.documents.length > 0) {
            data.documents.forEach(doc => {
                const f = doc.fields;
                if (f.status?.stringValue !== 'active') return;

                const id = doc.name.split('/').pop();
                const price = parseFloat(f.value?.doubleValue || f.value?.integerValue || 0).toFixed(2);
                const promo = f.promoValue ? parseFloat(f.promoValue.doubleValue || f.promoValue.integerValue).toFixed(2) : null;
                const img = f.images?.arrayValue?.values?.[0]?.stringValue || '';

                xml += `
  <item>
    <g:id>${id}</g:id>
    <g:title><![CDATA[${f.name?.stringValue || ''}]]></g:title>
    <g:description><![CDATA[${f.description?.stringValue || f.name?.stringValue || ''}]]></g:description>
    <g:link>https://loja.vitrineonline.app.br/${storeId}?id=${id}</g:link>
    <g:image_link>${img}</g:image_link>
    <g:condition>new</g:condition>
    <g:availability>in stock</g:availability>
    <g:price>${price} BRL</g:price>
    ${promo ? `<g:sale_price>${promo} BRL</g:sale_price>` : ''}
    <g:brand><![CDATA[${storeName}]]></g:brand>
  </item>`;
            });
        }

        xml += `\n</channel>\n</rss>`;
        fs.writeFileSync(`./${storeId}.xml`, xml);
        console.log(`📦 Arquivo [${storeId}.xml] criado com sucesso!`);
    } catch (e) {
        console.error(`❌ Erro ao gerar XML para ${storeId}:`, e);
    }
}

run();
