import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request) {
    try {
        const apiKey = process.env.GOOGLE_AI_API_KEY;

        if (!apiKey) {
            return NextResponse.json(
                { error: 'Google AI API key not configured' },
                { status: 500 }
            );
        }

        const body = await request.json();
        const rawText = body?.text;

        if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
            return NextResponse.json(
                { error: 'No grade card text provided' },
                { status: 400 }
            );
        }

        const prompt = `
You are an expert academic transcript parser for university grade cards (specifically KARE - Kalasalingam Academy of Research and Education, but also generic Indian university grade sheets).
Analyze the following copied grade card text and organize all course and semester information.

IMPORTANT: Return ONLY valid JSON, no markdown formatting, no code blocks, no text before or after the JSON.

Structure the response exactly like this:
{
  "studentName": "Extract student name if present in text, else empty string",
  "semesters": [
    {
      "semester": 1,
      "courses": [
        {
          "code": "211BIT1101",
          "name": "Biology for Engineers",
          "credits": 3.0,
          "grade": "C"
        }
      ]
    }
  ],
  "totalCGPA": 7.54
}

Rules for parsing:
1. Extract ALL courses from the pasted text.
2. Group courses by their semester (1, 2, 3, etc.). If semester headers exist (e.g. "Semester 1", "Sem 2", "2nd Semester"), use them. If no semester header is specified, group all courses into Semester 1.
3. Extract Course Code (e.g. "211BIT1101", "CSE3001", "MAT101"), Course Name/Title, Credits (as a number, e.g. 3.0, 4.0, 1.5), and Letter Grade (e.g. S, A, B, C, D, E, U, O, P, F, A+).
4. Ignore headers, footers, page numbers, disclaimers, or noise lines.
5. Extract final CGPA if explicitly mentioned (number like 8.25), else set totalCGPA to null.
6. Return ONLY the JSON object.

Grade card text to parse:
"""
${rawText}
"""
`;

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Clean up markdown block formatting if present
        let cleanText = text.trim();
        if (cleanText.startsWith('```json')) {
            cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (cleanText.startsWith('```')) {
            cleanText = cleanText.replace(/```\n?/g, '');
        }

        const extractedData = JSON.parse(cleanText);

        if (!extractedData.semesters || !Array.isArray(extractedData.semesters)) {
            extractedData.semesters = [];
        }

        return NextResponse.json({
            success: true,
            data: extractedData
        });

    } catch (error) {
        console.error('Error parsing pasted grades:', error);

        let errorMessage = 'Failed to parse grade card text';
        if (error.message.includes('API key')) {
            errorMessage = 'Invalid API key. Please check your Google AI API key.';
        } else if (error.message.includes('quota')) {
            errorMessage = 'API quota exceeded. Please try again later.';
        } else if (error instanceof SyntaxError) {
            errorMessage = 'Failed to parse text structure. Try cleaning up the pasted text.';
        }

        return NextResponse.json(
            { error: errorMessage, details: error.message },
            { status: 500 }
        );
    }
}
