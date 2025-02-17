import React, { useState, useCallback, useEffect } from 'react';
import { FolderOpen, Image as ImageIcon, Loader, X, Check, Trash2, AlertCircle, Folder } from 'lucide-react';
import { insertImage, getAllImages, approveImage, reanalyzeImage, deleteImage } from './lib/db';
import { analyzePictureWithLMStudio } from './lib/lmStudio';

interface ProcessedImage {
  filename: string;
  keywords: string;
  preview: string;
  base64?: string;
  sourceFolder?: string;
}

interface StoredImage {
  id: number;
  filename: string;
  text_content: string;
  status: 'temporary' | 'approved';
  hash: string;
  source_folder: string;
  date_of_entry: string;
  created_at: string;
  selectedTags?: string[];
}

interface ImageCardProps {
  image: StoredImage;
  showActions?: boolean;
  onTagSelect?: (tag: string) => void;
  selectedTags?: string[];
}

interface ErrorMessage {
  type: 'error' | 'warning';
  message: string;
  duplicateId?: number;
}

function App() {
  const [activeTab, setActiveTab] = useState<'analyze' | 'approved'>('analyze');
  const [processing, setProcessing] = useState(false);
  const [currentImage, setCurrentImage] = useState<ProcessedImage | null>(null);
  const [storedImages, setStoredImages] = useState<StoredImage[]>([]);
  const [recentlyAnalyzed, setRecentlyAnalyzed] = useState<StoredImage[]>([]);
  const [progress, setProgress] = useState(0);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState<number | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [totalFiles, setTotalFiles] = useState(0);
  const [processedFiles, setProcessedFiles] = useState(0);
  const [selectedTags, setSelectedTags] = useState<{ [key: number]: string[] }>({});

  const handleTagSelect = (imageId: number, tag: string) => {
    setSelectedTags(prev => {
      const currentTags = prev[imageId] || [];
      return {
        ...prev,
        [imageId]: currentTags.includes(tag)
          ? currentTags.filter(t => t !== tag)
          : [...currentTags, tag]
      };
    });
  };

  useEffect(() => {
    const loadImages = async () => {
      const images = await getAllImages();
      setStoredImages(images);
    };
    loadImages();
  }, []);

  const scrollToImage = useCallback((id: number) => {
    const element = document.getElementById(`image-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      element.classList.add('highlight-pulse');
      setTimeout(() => element.classList.remove('highlight-pulse'), 2000);
    }
  }, []);

  const processImages = useCallback(async (files: FileList) => {
    setProcessing(true);
    setProgress(0);
    setError(null);
    setRecentlyAnalyzed([]);
    setTotalFiles(files.length);
    setProcessedFiles(0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) {
        setProcessedFiles(prev => prev + 1);
        continue;
      }

      try {
        // Get source folder path
        const sourceFolder = file.webkitRelativePath.split('/')[0];

        // Convert file to base64
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        // Show current image being processed
        setCurrentImage({
          filename: file.name,
          keywords: 'Analysiere...',
          preview: base64,
          base64,
          sourceFolder
        });
        
        // Perform AI analysis with LM Studio
        const keywords = await analyzePictureWithLMStudio(base64);

        // Update current image with keywords
        setCurrentImage({
          filename: file.name,
          keywords,
          preview: base64,
          base64,
          sourceFolder
        });

        try {
          // Save to local database with base64 data
          const result = await insertImage(file.name, keywords, base64, sourceFolder);
          
          // Fetch the newly inserted image
          const images = await getAllImages();
          const newImage = images.find((img: StoredImage) => img.id === result.id);
          if (newImage) {
            setRecentlyAnalyzed(prev => [newImage, ...prev]);
          }
          
        } catch (error) {
          if (error instanceof Error && error.message.includes('existiert bereits')) {
            setError({
              type: 'warning',
              message: error.message,
              duplicateId: Number((error as any).duplicateId)
            });
            setProcessedFiles(prev => prev + 1);
            continue;
          }
          throw error;
        }

        // Update progress
        setProcessedFiles(prev => prev + 1);
        setProgress(((i + 1) / files.length) * 100);
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        setError({
          type: 'error',
          message: `Fehler beim Verarbeiten von "${file.name}": ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
        });
        setProcessedFiles(prev => prev + 1);
      }
    }

    setStoredImages(await getAllImages());
    setCurrentImage(null);
    setProcessing(false);
  }, []);

  const handleImageAction = async (image: StoredImage, action: 'approved' | 'rejected') => {
    try {
      if (action === 'approved') {
        await approveImage(image.id);
        const updatedImages = await getAllImages();
        setStoredImages(updatedImages);
        setRecentlyAnalyzed(prev => prev.filter(img => img.id !== image.id));
        // Lösche die ausgewählten Tags für dieses Bild
        setSelectedTags(prev => {
          const { [image.id]: _, ...rest } = prev;
          return rest;
        });
      } else {
        setReanalyzing(image.id);
        
        // Lade das Bild als Base64
        const response = await fetch(`/images/${image.filename}`);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        
        // Neue Analyse durchführen
        const newKeywords = await analyzePictureWithLMStudio(base64);
        
        // Behalte die ausgewählten Tags bei
        const currentSelectedTags = selectedTags[image.id] || [];
        const existingTags = image.text_content.split(',').map(t => t.trim());
        const newTags = newKeywords.split(',').map(t => t.trim());
        
        // Kombiniere ausgewählte Tags mit neuen Tags
        const combinedTags = [
          ...currentSelectedTags,
          ...newTags.filter(tag => !existingTags.includes(tag) || !currentSelectedTags.includes(tag))
        ];
        
        // In der Datenbank aktualisieren
        await reanalyzeImage(image.id, image.filename, combinedTags.join(', '));
        
        // Liste aktualisieren
        const updatedImages = await getAllImages();
        setStoredImages(updatedImages);
        setRecentlyAnalyzed(prev => {
          const updatedImage = updatedImages.find((img: StoredImage) => img.id === image.id);
          return updatedImage 
            ? prev.map(img => img.id === image.id ? updatedImage : img)
            : prev;
        });
        setReanalyzing(null);
      }
    } catch (error) {
      console.error('Error handling image action:', error);
      setReanalyzing(null);
      setError({
        type: 'error',
        message: 'Fehler bei der Bildverarbeitung'
      });
    }
  };

  const handleDeleteImage = async (id: number) => {
    try {
      await deleteImage(id);
      const updatedImages = await getAllImages();
      setStoredImages(updatedImages);
      setRecentlyAnalyzed(prev => prev.filter(img => img.id !== id));
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting image:', error);
      setError({
        type: 'error',
        message: 'Fehler beim Löschen des Bildes'
      });
    }
  };

  const handleFolderSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      processImages(files);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const temporaryImages = storedImages.filter(img => img.status !== 'approved');
  const approvedImages = storedImages.filter(img => img.status === 'approved');

  const ImageCard = ({ image, showActions = true, onTagSelect, selectedTags = [] }: ImageCardProps) => (
    <div 
      id={`image-${image.id}`}
      className="border rounded-lg p-4 transition-all duration-300"
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="font-medium">{image.filename}</h3>
          <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
            <Folder className="w-4 h-4" />
            <span>{image.source_folder}</span>
          </div>
        </div>
        <span className="text-sm text-gray-500">
          {formatDate(image.date_of_entry)}
        </span>
      </div>
      <div className="flex gap-4">
        <div className="flex-shrink-0">
          <img
            src={`/images/${image.filename}`}
            alt={image.filename}
            className="w-32 h-32 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setEnlargedImage(`/images/${image.filename}`)}
          />
        </div>
        <div className="flex-grow">
          <div className="flex flex-wrap gap-2">
            {image.text_content.split(',').map((keyword, index) => {
              const trimmedKeyword = keyword.trim();
              return (
                <button
                  key={index}
                  onClick={() => onTagSelect?.(trimmedKeyword)}
                  className={`px-2 py-1 rounded-full text-sm transition-colors ${
                    selectedTags.includes(trimmedKeyword)
                      ? 'bg-green-100 text-green-800'
                      : image.status === 'approved'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                  }`}
                >
                  {trimmedKeyword}
                </button>
              );
            })}
          </div>
        </div>
        {showActions && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => handleImageAction(image, 'approved')}
              disabled={reanalyzing === image.id}
              className={`p-2 rounded-lg transition-colors ${
                reanalyzing === image.id
                  ? 'bg-gray-100 cursor-not-allowed'
                  : 'hover:bg-gray-100'
              }`}
              title="Bestätigen"
            >
              <Check className="w-5 h-5" />
            </button>
            <button
              onClick={() => handleImageAction(image, 'rejected')}
              disabled={reanalyzing === image.id}
              className={`p-2 rounded-lg transition-colors ${
                reanalyzing === image.id
                  ? 'bg-gray-100 cursor-not-allowed'
                  : 'hover:bg-gray-100'
              }`}
              title="Neu analysieren"
            >
              {reanalyzing === image.id ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <X className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={() => setDeleteConfirm(image.id)}
              disabled={reanalyzing === image.id}
              className="p-2 rounded-lg transition-colors hover:bg-red-100"
              title="Löschen"
            >
              <Trash2 className="w-5 h-5 text-red-600" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <ImageIcon className="w-6 h-6" />
            Bild-Analyse
          </h1>

          {error && (
            <div className={`mb-4 p-3 rounded-lg flex items-start gap-2 ${
              error.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p>{error.message}</p>
                {error.duplicateId && (
                  <button
                    onClick={() => {
                      scrollToImage(error.duplicateId!);
                      setError(null);
                    }}
                    className="text-sm underline hover:no-underline mt-1"
                  >
                    Zum duplizierten Bild springen
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b mb-6">
            <button
              className={`px-4 py-2 font-medium ${
                activeTab === 'analyze'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('analyze')}
            >
              Analyse & Historie
            </button>
            <button
              className={`px-4 py-2 font-medium ${
                activeTab === 'approved'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('approved')}
            >
              Bestätigte Bilder
            </button>
          </div>
          
          {activeTab === 'analyze' && (
            <>
              <div className="mb-6">
                <label 
                  htmlFor="folder-input"
                  className={`
                    flex items-center justify-center gap-2 p-4 border-2 border-dashed 
                    rounded-lg cursor-pointer transition-colors
                    ${processing ? 'bg-gray-100 cursor-not-allowed' : 'hover:bg-gray-50'}
                  `}
                >
                  <FolderOpen className="w-6 h-6" />
                  <span>Ordner auswählen</span>
                  <input
                    id="folder-input"
                    type="file"
                    webkitdirectory="true"
                    multiple
                    className="hidden"
                    onChange={handleFolderSelect}
                    disabled={processing}
                  />
                </label>
              </div>

              {processing && (
                <div className="mb-6">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Loader className="w-4 h-4 animate-spin" />
                      <span>Analysiere Bilder...</span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {processedFiles} von {totalFiles} Dateien
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {currentImage && (
                <div className="mb-8 border rounded-lg p-4">
                  <h3 className="font-medium mb-3">{currentImage.filename}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <img 
                        src={currentImage.preview} 
                        alt={currentImage.filename}
                        className="w-full h-auto rounded-lg shadow-sm"
                      />
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Schlagworte:</h4>
                      <div className="flex flex-wrap gap-2">
                        {currentImage.keywords.split(',').map((keyword, index) => (
                          <span 
                            key={index}
                            className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm"
                          >
                            {keyword.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {recentlyAnalyzed.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-xl font-semibold mb-4">Kürzlich analysiert:</h2>
                  <div className="space-y-4">
                    {recentlyAnalyzed.map((image) => (
                      <ImageCard
                        key={image.id}
                        image={image}
                        onTagSelect={(tag) => handleTagSelect(image.id, tag)}
                        selectedTags={selectedTags[image.id] || []}
                      />
                    ))}
                  </div>
                </div>
              )}

              {temporaryImages.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold">Frühere Analysen:</h2>
                  {temporaryImages
                    .filter((img: StoredImage) => !recentlyAnalyzed.some((recent: StoredImage) => recent.id === img.id))
                    .map((image) => (
                      <ImageCard
                        key={image.id}
                        image={image}
                        onTagSelect={(tag) => handleTagSelect(image.id, tag)}
                        selectedTags={selectedTags[image.id] || []}
                      />
                    ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'approved' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Bestätigte Bilder:</h2>
              {approvedImages.length === 0 ? (
                <p className="text-gray-500">Noch keine Bilder bestätigt.</p>
              ) : (
                approvedImages.map((image) => (
                  <ImageCard key={image.id} image={image} showActions={false} />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal für vergrößerte Bildansicht */}
      {enlargedImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full">
            <button
              className="absolute top-2 right-2 bg-white rounded-full p-1 hover:bg-gray-100"
              onClick={() => setEnlargedImage(null)}
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={enlargedImage}
              alt="Vergrößerte Ansicht"
              className="w-full h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Löschen Bestätigungsdialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">Bild löschen?</h3>
            <p className="text-gray-600 mb-6">
              Möchten Sie dieses Bild wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Abbrechen
              </button>
              <button
                onClick={() => handleDeleteImage(deleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg"
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;