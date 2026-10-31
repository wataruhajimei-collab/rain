/**
 * 雨の妖精しずくくん ランキング用 Cloudflare Worker
 * 
 * [デプロイ手順]
 * 1. Cloudflare Dashboard から「Workers & Pages」を開く
 * 2. 「作成」 -> 「Worker の作成」をクリック
 * 3. 名前（例: rain-ranking）を付けて「デプロイ」をクリック
 * 4. 左メニュー「ストレージとデータベース」->「KV」から、新しいKV名前空間（例: RAIN_KV）を作成
 * 5. 作成した Worker（rain-ranking）の設定画面 ->「バインディング」を開く
 * 6. 「KV名前空間バインディング」を追加：
 *    - 変数名: `RAIN_KV`
 *    - KV名前空間: 先ほど作成した KV（RAIN_KV）を選択して「デプロイ」
 * 7. Workerの「コードを編集」を開き、この worker.js の内容をすべて貼り付けて「保存してデプロイ」
 * 8. 発行されたURL（例: https://rain-ranking.wataruhajimei.workers.dev）が
 *    game.js 内の API_URL と一致していることを確認します。
 */

export default {
    async fetch(request, env, ctx) {
        // CORS設定（すべてのドメインからのアクセスを許可）
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);

        // --- GET /ranking : ランキング一覧の取得 ---
        if (request.method === "GET" && (url.pathname === "/ranking" || url.pathname === "/")) {
            try {
                const KV = env.RAIN_KV;
                if (!KV) {
                    return new Response(JSON.stringify({ error: "KV not bound. Please bind RAIN_KV." }), {
                        status: 500,
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                }
                const rankingData = await KV.get("ranking", { type: "json" });
                return new Response(JSON.stringify(rankingData || []), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: "Failed to fetch ranking: " + e.message }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }
        }

        // --- POST /submit : スコア登録 ---
        if (request.method === "POST" && url.pathname === "/submit") {
            try {
                const KV = env.RAIN_KV;
                if (!KV) {
                    return new Response(JSON.stringify({ error: "KV not bound. Please bind RAIN_KV." }), {
                        status: 500,
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                }

                const body = await request.json();
                const { name, level, shizukuName, totalDrops, goldDrops, date } = body;

                if (!name || typeof level !== 'number') {
                    return new Response(JSON.stringify({ error: "Invalid parameters" }), {
                        status: 400,
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                }

                const cleanName = String(name).trim().slice(0, 15) || "ななしの妖精";
                let ranking = (await KV.get("ranking", { type: "json" })) || [];

                // 既存の同じ名前の記録があれば比較
                const existingIndex = ranking.findIndex(r => r.name === cleanName);
                if (existingIndex >= 0) {
                    const ex = ranking[existingIndex];
                    let isBetter = false;

                    if (level > ex.level) {
                        isBetter = true;
                    } else if (level === ex.level) {
                        if ((totalDrops || 0) > (ex.totalDrops || 0)) {
                            isBetter = true;
                        } else if ((totalDrops || 0) === (ex.totalDrops || 0) && (goldDrops || 0) > (ex.goldDrops || 0)) {
                            isBetter = true;
                        }
                    }

                    if (isBetter) {
                        ranking[existingIndex] = {
                            name: cleanName,
                            level: level,
                            shizukuName: shizukuName || `Lv.${level} しずく`,
                            totalDrops: totalDrops || 0,
                            goldDrops: goldDrops || 0,
                            date: date || new Date().toLocaleDateString('ja-JP')
                        };
                    } else {
                        // 記録更新ならず
                        return new Response(JSON.stringify({ success: true, updated: false, ranking }), {
                            headers: { ...corsHeaders, "Content-Type": "application/json" }
                        });
                    }
                } else {
                    // 新規追加
                    ranking.push({
                        name: cleanName,
                        level: level,
                        shizukuName: shizukuName || `Lv.${level} しずく`,
                        totalDrops: totalDrops || 0,
                        goldDrops: goldDrops || 0,
                        date: date || new Date().toLocaleDateString('ja-JP')
                    });
                }

                // ソート: 1. 進化レベル降順, 2. 総雨粒数降順, 3. ゴージャス度降順
                ranking.sort((a, b) => {
                    if (b.level !== a.level) return b.level - a.level;
                    if ((b.totalDrops || 0) !== (a.totalDrops || 0)) return (b.totalDrops || 0) - (a.totalDrops || 0);
                    return (b.goldDrops || 0) - (a.goldDrops || 0);
                });

                // 上位100件までに制限
                ranking = ranking.slice(0, 100);

                // 保存
                await KV.put("ranking", JSON.stringify(ranking));

                return new Response(JSON.stringify({ success: true, updated: true, ranking }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: "Failed to save: " + e.message }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }
        }

        return new Response("Not Found", { status: 404, headers: corsHeaders });
    }
};
