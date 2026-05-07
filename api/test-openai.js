import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: "請用台灣短影音口吻，幫林口四個圈輪業寫一句吸引人的輪胎店開場白。",
  });

  console.log(response.output_text);
}

main();