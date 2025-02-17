interface ChatCompletionResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

export const analyzePictureWithLMStudio = async (base64Image: string): Promise<string> => {
  try {
    const response = await fetch('http://localhost:1234/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen2-vl-7b-instruct',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analysiere dieses Bild und gib genau 15 deutsche Schlagworte zurück, die durch Kommas getrennt sind. Mindestens 10 der Schlagworte MÜSSEN konkrete, sichtbare Objekte auf dem Bild sein (z.B. "Tisch", "Baum", "Kaffeetasse"). Versuche den Flugzeughersteller und das Flugzeugmodell zu bestimmen. Die restlichen Schlagworte können Stimmungen, Farben oder abstrakte Konzepte beschreiben. Gib NUR die Schlagworte ohne Anführungszeichen zurück, keinen weiteren Text.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: base64Image
                }
              }
            ]
          }
        ],
        max_tokens: 200
      }),
    });

    if (!response.ok) {
      throw new Error(`LM Studio API error: ${response.statusText}`);
    }

    const data: ChatCompletionResponse = await response.json();
    return data.choices[0]?.message?.content || 'Keine Analyse verfügbar';
  } catch (error) {
    console.error('Error analyzing image with LM Studio:', error);
    return 'Fehler bei der Bildanalyse mit LM Studio';
  }
}