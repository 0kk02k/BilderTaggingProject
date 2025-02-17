const API_URL = 'http://localhost:3004/api';

export const insertImage = async (filename: string, textContent: string, imageData: string, sourceFolder: string) => {
  const response = await fetch(`${API_URL}/images`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename,
      textContent,
      imageData,
      sourceFolder
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to insert image');
  }
  
  return response.json();
};

export const getAllImages = async () => {
  const response = await fetch(`${API_URL}/images`);
  return response.json();
};

export const getAvailableImages = async () => {
  const response = await fetch(`${API_URL}/available-images`);
  return response.json();
};

export const approveImage = async (id: number) => {
  const response = await fetch(`${API_URL}/images/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id }),
  });
  return response.json();
};

export const reanalyzeImage = async (id: number, filename: string, newKeywords: string) => {
  const response = await fetch(`${API_URL}/images/reanalyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id,
      filename,
      newKeywords
    }),
  });
  return response.json();
};

export const deleteImage = async (id: number) => {
  const response = await fetch(`${API_URL}/images/${id}`, {
    method: 'DELETE',
  });
  return response.json();
};

export const checkDuplicate = async (imageData: string) => {
  const response = await fetch(`${API_URL}/images/check-duplicate?imageData=${encodeURIComponent(imageData)}`);
  return response.json();
};
