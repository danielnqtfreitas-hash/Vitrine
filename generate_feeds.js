const fs = require('fs');

const PROJECT_ID = "meuestoque-1badc";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Lista manual para garantir que o robô saiba onde ir
const LOJAS_PARA_VERIFICAR = ['dandan']; 

async function run() {
    console.log("🚀 Iniciando Gerador de Feeds...");

    for (const storeId of LOJAS_PARA_VERIFICAR) {
        try {
            const configResp = await fetch(`${BASE_URL}/stores/${storeId}/config/store`);
            const configData = await configResp.json();

            if (!configData.fields) {
                console.log(`❌ Erro: Dados da loja [${storeId}] não encontrados.`);
                continue;
            }

            // --- BUSCA AVANÇADA DO PLANO ---
            const fields = configData.fields;
            const planFields = fields.plan?.mapValue?.fields || {};
            
            // Tenta pegar o ID do plano de 3 lugares diferentes para não ter erro
            const pId = (
                planFields.planId?.stringValue || 
                fields.planId?.stringValue || 
                fields.id?.stringValue || 
                ""
            ).trim().toLowerCase();

            console.log(`🔍 Analisando Loja: ${storeId} | ID do Plano Encontrado: "${pId}"`);

            // --- REGRA DE OURO: SE FOR 'DANDAN', GERA DE QUALQUER JEITO ---
            const eDandan = storeId.toLowerCase() === 'dandan';
            const ePlanoValido = pId.includes("profissional") || pId.includes("beta") || pId.includes("xqes739tk");

            if (eDandan || ePlanoValido) {
                console.log(`✅ APROVADO! Gerando arquivo XML para [${storeId}]...`);
                const storeName = fields.storeName?.stringValue || storeId;
                await generateXml(storeId, storeName);
            } else {
                console.log(`⏭️ Ignorado: Loja não é 'dandan' nem possui plano Profissional ativo.`);
            }
        } catch (e) {
            console.error(`💥 Erro fatal ao processar [${storeId}]:`, e);
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
  <description>Feed de Produtos Atualizado</description>`;

        if (data.documents && data.documents.length > 0) {
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
  </item>`;
            });
            console.log(`✨ Processados ${data.documents.length} itens para o XML.`);
        }

        xml += `\n</channel>\n</rss>`;
        fs.writeFileSync(`./${storeId}.xml`, xml);
        console.log(`📦 SUCESSO: Arquivo [${storeId}.xml] salvo no repositório!`);
    } catch (e) {
        console.error(`❌ Erro ao gerar conteúdo do XML:`, e);
    }
}

run();
