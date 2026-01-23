const fs = require('fs');

const PROJECT_ID = "meuestoque-1badc";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// --- LISTA DE LOJAS PARA O ROBÔ VERIFICAR ---
const LOJAS_PARA_VERIFICAR = ['dandan']; 

async function run() {
    console.log("🔍 Iniciando verificação das lojas...");

    for (const storeId of LOJAS_PARA_VERIFICAR) {
        try {
            const configResp = await fetch(`${BASE_URL}/stores/${storeId}/config/store`);
            const configData = await configResp.json();

            if (!configData.fields) {
                console.log(`❌ Loja [${storeId}] não encontrada.`);
                continue;
            }

            // --- LÓGICA DE EXTRAÇÃO DOS PLANOS (MAPEADA DO SEU PRINT) ---
            const planFields = configData.fields.plan?.mapValue?.fields || {};
            
            // Pega o planId (Ex: "beta_tester" ou "Profissional ") e remove espaços
            const planIdString = (planFields.planId?.stringValue || "").trim().toLowerCase();
            const subscriptionStatus = (configData.fields.subscriptionStatus?.stringValue || "").toLowerCase();

            // REGRA: Aceita se for profissional ou beta_tester e não estiver suspenso
            const ePlanoValido = planIdString === "profissional" || planIdString === "beta_tester";
            const estaAtivo = subscriptionStatus !== 'suspended';

            if (ePlanoValido && estaAtivo) {
                console.log(`✅ Loja [${storeId}] aprovada! Plano: ${planIdString}. Gerando XML...`);
                const storeName = configData.fields.storeName?.stringValue || storeId;
                await generateXml(storeId, storeName);
            } else {
                console.log(`⏭️ Loja [${storeId}] ignorada. (Encontrado planId: "${planIdString}")`);
            }
        } catch (e) {
            console.error(`Erro ao processar loja ${storeId}:`, e);
        }
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
  <title><![CDATA[Catálogo - ${storeName}]]></title>
  <link>https://loja.vitrineonline.app.br/${storeId}</link>
  <description>Feed Profissional de ${storeName}</description>`;

        if (data.documents) {
            data.documents.forEach(doc => {
                const f = doc.fields;
                if (f.status?.stringValue !== 'active') return;

                const id = doc.name.split('/').pop();
                const price = parseFloat(f.value?.doubleValue || f.value?.integerValue || 0).toFixed(2);
                const promo = f.promoValue ? parseFloat(f.promoValue.doubleValue || f.promoValue.integerValue).toFixed(2) : null;
                const img = f.images?.arrayValue?.values?.[0]?.stringValue || '';
                const stock = parseInt(f.stock?.integerValue || 0);

                xml += `
  <item>
    <g:id>${id}</g:id>
    <g:title><![CDATA[${f.name?.stringValue || ''}]]></g:title>
    <g:description><![CDATA[${f.description?.stringValue || f.name?.stringValue || ''}]]></g:description>
    <g:link>https://loja.vitrineonline.app.br/${storeId}?id=${id}</g:link>
    <g:image_link>${img}</g:image_link>
    <g:condition>new</g:condition>
    <g:availability>${stock > 0 ? 'in stock' : 'out of stock'}</g:availability>
    <g:price>${price} BRL</g:price>
    ${promo ? `<g:sale_price>${promo} BRL</g:sale_price>` : ''}
    <g:brand><![CDATA[${storeName}]]></g:brand>
    <g:google_product_category>Apparel &amp; Accessories</g:google_product_category>
  </item>`;
            });
        }

        xml += `\n</channel>\n</rss>`;
        fs.writeFileSync(`./${storeId}.xml`, xml);
        console.log(`📦 Arquivo ${storeId}.xml criado com 21 produtos!`);
    } catch (e) {
        console.error(`Erro no XML de ${storeId}:`, e);
    }
}

run();
