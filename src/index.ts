require("dotenv").config();
import express, { RequestHandler } from "express"; // Import RequestHandler
import { GoogleGenerativeAI } from "@google/generative-ai";
import { BASE_PROMPT, getSystemPrompt } from "./prompts";
import { basePrompt as nodeBasePrompt } from "./defaults/node";
import { basePrompt as reactBasePrompt } from "./defaults/react";
import cors from "cors";
const app = express();
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
    // allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));



// --- FIX: Define the handler as an explicitly typed constant ---
const templateHandler: RequestHandler = async (req, res) => {
    const userPrompt = req.body.prompt;
    
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const fullPrompt = `Return either node or react based on what do you think this project should be. Only return a single word either 'node' or 'react'. Do not return anything extra. Here is the user's input: "${userPrompt}"`;

        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        
        const answer = response.text().trim();

        if (answer.toLowerCase().includes("react")) {
            // FIX: Removed 'return'
            res.json({
                prompts: [BASE_PROMPT, `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactBasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`],
                uiPrompts: [reactBasePrompt]
            });
            return; // Use a standalone return to exit the function
        }

        if (answer.toLowerCase().includes("node")) {
            // FIX: Removed 'return'
            res.json({
                prompts: [`Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactBasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`],
                uiPrompts: [nodeBasePrompt]
            });
            return; // Use a standalone return to exit the function
        }

        res.status(403).json({ message: "Model did not return a valid choice." });

    } catch (error) {
        console.error("Error in /template route:", error);
        res.status(500).json({ message: "An error occurred on the server." });
    }
};

app.post("/template", templateHandler);

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

// --- FIX: Define the handler as an explicitly typed constant ---
const chatHandler: RequestHandler = async (req, res) => {
    const messages: ChatMessage[] = req.body.messages;
    
    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            systemInstruction: getSystemPrompt(),
        });
        
        const history = messages.map(msg => ({ 
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        const latestUserMessage = history.pop();
        
        if (!latestUserMessage) {
            res.status(400).json({ message: "No user message found to process." });
            return;
        }

        const chat = model.startChat({
            history: history,
        });

        const result = await chat.sendMessage(latestUserMessage.parts);
        const response = await result.response;
        
        res.json({
            response: response.text()
        });
        
    } catch (error) {
        console.error("Error in /chat route:", error);
        res.status(500).json({ message: "An error occurred on the server." });
    }
};

app.post("/chat", chatHandler);

app.listen(4000, () => {
  console.log("🚀 Backend running on http://localhost:4000");
});
