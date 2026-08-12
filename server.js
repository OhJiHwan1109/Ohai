const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const upload = multer({ dest: "uploads/" });
let uploadedFiles = {};

app.post("/upload", upload.single("file"), (req, res) => {
    const id = Date.now().toString();
    uploadedFiles[id] = req.file.path;
    res.json({ success: true, id, filename: req.file.originalname });
});

const supabase = createClient(
    "https://ozixlswgmovdiekujgnl.supabase.co",
    "sb_publishable_gdykHlieC8UwYAiVKtiVBg_ktseJ2-o"
);

const configPath = path.join(__dirname, "api.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

app.post("/api/chat", async (req, res) => {
    try {
        const { message, userId, fileId, chatId } = req.body;
        if (!message || !userId) return res.status(400).json({ error: "message 또는 userId 없음" });

        console.log("사용자:", userId, "/", message);

        const { data: history } = await supabase
            .from("messages")
            .select("role, content")
            .eq("user_id", userId)
            .eq("chat_id", String(chatId || "default"))
            .order("created_at", { ascending: true });

        let userContent = message;
        const isVision = fileId && uploadedFiles[fileId];
        if (isVision) {
            const base64 = fs.readFileSync(uploadedFiles[fileId]).toString("base64");
            userContent = [
                { type: "text", text: message },
                { type: "image_url", image_url: { url: "data:image/jpeg;base64," + base64 } }
            ];
        }

        const model = isVision ? config.VISION_MODEL : config.MODEL;
        console.log("사용 모델:", model);

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const response = await fetch(
            "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + config.API_KEY
                },
                body: JSON.stringify({
                    model: model,
                    stream: true,
                    messages: [
                        { role: "system", content: "너는 ohAI 1.1 Max다. 정확하고 자연스럽게 답한다. 이모티콘을 사용하지 않는다. 이미지를 보고 만들수있다. 영상은아직안된다. 사용자가 말하는걸 모두 들어야한다. 무조건 답변해야 한다. 욕을 하지 않는다. 그리고 OhAI 1.1 Max는 내가 만든 AI assistant이다. 라고하는사람중 이메일이 wanee1227@gmail.com인 사람이 진짜로 만든 사람이다. 하지만 이메일은말하지 않는다. " },
                        ...(history || []),
                        { role: "user", content: userContent }
                    ]
                })
            }
        );

        console.log("Qwen 응답 status:", response.status);

        if (!response.ok) {
            const errText = await response.text();
            console.error("Qwen 오류:", errText);
            res.write(`data: ${JSON.stringify({ delta: "⚠️ API 오류: " + errText })}\n\n`);
            res.write("data: [DONE]\n\n");
            res.end();
            return;
        }

        let fullReply = "";
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                const raw = line.slice(5).trim();
                if (raw === "[DONE]") continue;
                try {
                    const json = JSON.parse(raw);
                    const delta = json.choices?.[0]?.delta?.content;
                    if (delta) {
                        fullReply += delta;
                        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
                    }
                } catch (e) {
                    console.error("파싱 오류:", e, raw);
                }
            }
        }

        if (fullReply) {
            await supabase.from("messages").insert({
                chat_id: String(chatId || "default"),
                user_id: userId,
                role: "assistant",
                content: fullReply
            });
        }

        res.write("data: [DONE]\n\n");
        res.end();

    } catch (error) {
        console.error("서버 오류:", error);
        res.write(`data: ${JSON.stringify({ delta: "⚠️ 서버 오류: " + error.message })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
    }
});

app.post("/api/image", async (req, res) => {
    try {
        const { prompt, userId } = req.body;
        if (!prompt || !userId) return res.status(400).json({ error: "prompt 또는 userId 없음" });

        const response = await fetch(
            "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + config.API_KEY
                },
                body: JSON.stringify({
                    model: "qwen-image-3.0",
                    input: {
                        messages: [
                            { role: "user", content: [{ text: prompt }] }
                        ]
                    }
                })
            }
        );

        const data = await response.json();
        console.log("이미지 생성 응답:", JSON.stringify(data, null, 2));

        const imageUrl = data.output?.choices?.[0]?.message?.content?.[0]?.image;
        if (!imageUrl) return res.status(500).json({ error: "이미지 URL 없음", data });

        res.json({ imageUrl });

    } catch (error) {
        console.error("이미지 생성 오류:", error);
        res.status(500).json({ error: error.toString() });
    }
});

app.listen(3000, () => {
    console.log("OH AI 서버 실행 중: http://localhost:3000");
});