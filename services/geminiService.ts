import { GoogleGenAI, Type } from "@google/genai";
import { LineItem } from "../types";

const apiKey = process.env.API_KEY || '';
// Note: In a real app, handle missing API key gracefully. 
// For this strict prompt, we assume it's available.

const ai = new GoogleGenAI({ apiKey });

/**
 * Helper to retry async operations with exponential backoff.
 * Useful for handling transient network errors (like XHR code 6 or 503s).
 */
const retryOperation = async <T>(
  operation: () => Promise<T>, 
  retries = 3, 
  delay = 1000
): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    if (retries <= 0) throw error;
    
    // Log retry attempt
    console.warn(`Operation failed, retrying in ${delay}ms... (${retries} retries left)`, error.message);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryOperation(operation, retries - 1, delay * 2);
  }
};

/**
 * Polishes a single line item description using a fast, lightweight model.
 * Updated to use standard gemini-2.5-flash as the lite preview was causing 404s.
 */
export const polishDescription = async (text: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Rewrite the following invoice line item description to be more professional, concise, and clear for a construction invoice. Return ONLY the rewritten text.
      
      Input: "${text}"`,
    });
    return response.text?.trim() || text;
  } catch (error) {
    console.error("AI Polish Error:", error);
    return text;
  }
};

/**
 * Analyzes raw project notes and converts them into structured line items.
 * Uses gemini-3-pro-preview (Thinking model) for complex reasoning.
 */
export const analyzeWorkNotes = async (notes: string): Promise<Partial<LineItem>[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `You are an expert construction estimator. Analyze the following raw work notes and break them down into invoice line items. 
      
      CRITICAL: You must strictly separate items into two types:
      1. 'service': Labor, hours worked, consultation, installation, management time.
      2. 'expense': Materials, hardware, fuel, consumables, equipment hire, reimbursements, Bunnings/Mitre 10 purchases.

      For each item, provide:
      - type: 'service' or 'expense'.
      - description: A professional description.
      - date: (YYYY-MM-DD format).
      - hours: Estimated hours (for service) or Quantity (for expense, usually 1).
      - rate: Suggested hourly rate (default 65-85 for labor) or Unit Cost (for expense).
      
      Raw Notes:
      ${notes}`,
      config: {
        thinkingConfig: {
          thinkingBudget: 32768, 
        },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ['service', 'expense'] },
              date: { type: Type.STRING },
              description: { type: Type.STRING },
              hours: { type: Type.NUMBER },
              rate: { type: Type.NUMBER },
            },
            required: ['type', 'description', 'hours', 'rate'],
          }
        }
      }
    });

    let jsonText = response.text || '[]';
    // Remove markdown code blocks (e.g. ```json ... ```) to ensure clean parsing
    jsonText = jsonText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("AI Analysis Error:", error);
    throw error;
  }
};

/**
 * Extracts line items from a PDF document (invoice/timesheet).
 * Uses gemini-2.5-flash for multimodal capabilities.
 * Includes retry logic to handle XHR errors.
 */
export const parseInvoicePDF = async (base64Data: string): Promise<Partial<LineItem>[]> => {
  return retryOperation(async () => {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Data
            }
          },
          {
            text: `Extract all invoice line items from this PDF document.
            Return a JSON array where each object has these fields:
            - type: 'service' (labor/time) or 'expense' (materials/goods/fees).
            - date: (YYYY-MM-DD).
            - description: (string).
            - hours: (number, default 0 for expenses, or hours for labor).
            - rate: (number).
            - amount: (number).
            
            STRICT CLASSIFICATION RULES:
            - 'service': Labor, Hours, Work, Installation, Time, Consultation.
            - 'expense': Materials, Hardware, Bunnings, Mitre 10, Placemakers, ITM, Carters, Fuel, Parking, Travel, Consumables, Screws, Timber, Concrete.
            
            Return ONLY valid JSON.`
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ['service', 'expense'] },
                date: { type: Type.STRING },
                description: { type: Type.STRING },
                hours: { type: Type.NUMBER },
                rate: { type: Type.NUMBER },
                amount: { type: Type.NUMBER },
              },
              required: ['description', 'amount'],
            }
          }
        }
      });

      const jsonText = response.text || '[]';
      return JSON.parse(jsonText);
    } catch (error) {
      console.error("PDF Parsing Error:", error);
      throw error;
    }
  });
};