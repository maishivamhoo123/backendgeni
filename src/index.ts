require("dotenv").config();
import express, { RequestHandler } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { BASE_PROMPT, getSystemPrompt } from "./prompts";
import { basePrompt as nodeBasePrompt } from "./defaults/node";
import { basePrompt as reactBasePrompt } from "./defaults/react";
import cors from "cors";

const app = express();
app.use(express.json()); // ✅ body parser for POST requests

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined in the environment variables.");
}
const genAI = new GoogleGenerativeAI(apiKey);

const allowedOrigins = [
  "http://localhost:5173",
  "https://webistegenerator-frontend.onrender.com"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow curl/postman
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));

// ✅ Handle preflight CORS requests
app.options("*", cors());

/* ---------------- Template Route ---------------- */
const templateHandler: RequestHandler = async (req, res) => {
    const userPrompt = req.body.prompt;

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const fullPrompt = `Return either node or react... Here is the user's input: "${userPrompt}"`;

        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        const answer = response.text().trim();

        if (answer.toLowerCase().includes("react")) {
            res.json({
                prompts: [
                    BASE_PROMPT,
                    `Here is an artifact...${reactBasePrompt}`
                ],
                uiPrompts: [reactBasePrompt]
            });
            return;
        }

        if (answer.toLowerCase().includes("node")) {
            res.json({
                prompts: [
                    `Here is an artifact...${nodeBasePrompt}`
                ],
                uiPrompts: [nodeBasePrompt]
            });
            return;
        }

        res.status(403).json({ message: "Model did not return a valid choice." });

    } catch (error) {
        console.error("Error in /template route:", error);
        res.status(500).json({ message: "An error occurred on the server." });
    }
};
app.post("/template", templateHandler);

/* ---------------- Chat Route ---------------- */
interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

const chatHandler: RequestHandler = async (req, res) => {
    const messages: ChatMessage[] = req.body.messages;

    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: getSystemPrompt(),
        });

        const history = messages.map(msg => ({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }]
        }));

        const latestUserMessage = history.pop();
        if (!latestUserMessage) {
            res.status(400).json({ message: "No user message found to process." });
            return;
        }

        const chat = model.startChat({ history });
        const result = await chat.sendMessage(latestUserMessage.parts);
        const response = await result.response;

        res.json({ response: response.text() });

    } catch (error) {
        console.error("Error in /chat route:", error);
        res.status(500).json({ message: "An error occurred on the server." });
    }
};
app.post("/chat", chatHandler);

/* ---------------- Server Start ---------------- */
// ✅ Render assigns PORT via env var
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
