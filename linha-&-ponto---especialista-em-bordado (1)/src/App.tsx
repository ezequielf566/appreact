import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Upload, 
  Image as ImageIcon, 
  Scissors, 
  Palette, 
  Info, 
  Download, 
  Loader2, 
  CheckCircle2,
  ChevronRight,
  Maximize2,
  Sparkles,
  Camera,
  Heart,
  Share2,
  ArrowLeft,
  Clock,
  Minus,
  AlignJustify,
  CircleDot,
  Spline,
  Link,
  Brush,
  Flower,
  PenTool,
  X,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Removed hardcoded API key for security and compliance
// const API_KEY = "...";
// const ai = new GoogleGenAI({ apiKey: API_KEY });

interface AnalysisResult {
  analysis: {
    type: string;
    focus: string;
    complexity: string;
    colors: string[];
  };
  patterns: {
    outline: string;
    color: string;
  };
  palette: {
    name: string;
    hex: string;
    type: 'Contorno' | 'Preenchimento' | 'Detalhe';
    premiumLine: string;
    budgetLine: string;
    searchUrl: string;
    estimatedSkeins: number;
  }[];
  conversions: {
    color: string;
    dmc: string;
    anchor: string;
    maxi: string;
  }[];
  stitches: {
    outline: {
      name: string;
      description: string;
      usage: string;
      icon: 'backstitch' | 'satin' | 'french_knot' | 'stem' | 'chain' | 'long_short' | 'lazy_daisy' | 'other';
    }[];
    color: {
      name: string;
      description: string;
      usage: string;
      icon: 'backstitch' | 'satin' | 'french_knot' | 'stem' | 'chain' | 'long_short' | 'lazy_daisy' | 'other';
    }[];
  };
  instructions: {
    tips: {
      outline: string[];
      color: string[];
    };
  };
  timeEstimate: {
    outline: { beginner: number; intermediate: number; advanced: number };
    color: { beginner: number; intermediate: number; advanced: number };
  };
  fillingSuggestions: string;
  preview: string;
  size: string;
  fabric: string;
}

const LOGO_URL = "https://bancodedados-five.vercel.app/Gemini_Generated_Image_q1k163q1k163q1k1.png";

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [generatedOutlineImage, setGeneratedOutlineImage] = useState<string | null>(null);
  const [generatedColorImage, setGeneratedColorImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingColorImage, setIsGeneratingColorImage] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'outline' | 'color'>('outline');
  const [showMockup, setShowMockup] = useState(false);
  const [hoopSize, setHoopSize] = useState<number>(12);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const HOOP_SIZES = [7, 9, 12, 16];

  const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
      ),
    ]);
  };

  const cancelAnalysis = () => {
    setIsAnalyzing(false);
    setIsGeneratingImage(false);
    setIsGeneratingColorImage(false);
    setError("Processamento cancelado pelo usuário.");
  };

  const getHoopScale = (size: number) => {
    switch(size) {
      case 7: return 'w-[95%] h-[95%]';
      case 9: return 'w-[85%] h-[85%]';
      case 12: return 'w-[75%] h-[75%]';
      case 16: return 'w-[65%] h-[65%]';
      default: return 'w-[85%] h-[85%]';
    }
  };

  const getDynamicTime = (baseHours: number) => {
    const ratio = Math.pow(hoopSize / 12, 2);
    const calc = Math.max(1, Math.round(baseHours * ratio));
    return `${calc}h`;
  };

  const getDynamicSkeins = (baseSkeins: number) => {
    const ratio = Math.pow(hoopSize / 12, 2);
    const calc = baseSkeins * ratio;
    if (calc <= 0.3) return "Apenas sobras";
    const rounded = Math.ceil(calc);
    return `${rounded} ${rounded > 1 ? 'meadas' : 'meada'}`;
  };

  const getStitchIcon = (iconType: string) => {
    switch (iconType) {
      case 'backstitch': return <Minus className="w-6 h-6" />;
      case 'satin': return <AlignJustify className="w-6 h-6" />;
      case 'french_knot': return <CircleDot className="w-6 h-6" />;
      case 'stem': return <Spline className="w-6 h-6" />;
      case 'chain': return <Link className="w-6 h-6" />;
      case 'long_short': return <Brush className="w-6 h-6" />;
      case 'lazy_daisy': return <Flower className="w-6 h-6" />;
      default: return <PenTool className="w-6 h-6" />;
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setGeneratedOutlineImage(null);
        setGeneratedColorImage(null);
        setResult(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async () => {
    if (!image) return;

    // Safe check for API key that works both in AI Studio and Vercel/Vite
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    
    if (!apiKey) {
      setError("Chave de API não encontrada. Por favor, adicione a variável VITE_GEMINI_API_KEY nas configurações do Vercel.");
      return;
    }

    if (!isOnline) {
      setError("Sem conexão com a internet. Verifique seu Wi-Fi ou dados móveis.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey });
      const mimeType = image.split(';')[0].split(':')[1] || "image/jpeg";
      const base64Data = image.split(',')[1];
      
      const prompt = `
        Você é uma IA especialista em bordado manual. Analise esta imagem e transforme-a em um guia de bordado profissional.
        
        Siga rigorosamente estas etapas:
        1. Analise o tipo, foco, complexidade e cores.
        2. Sugira o tamanho ideal do bastidor (ex: 15cm, 20cm).
        3. Crie dois níveis de risco:
           - OUTLINE (Contornos): Apenas contornos essenciais, foco TOTAL no elemento principal.
           - COLOR (Colorido): Guia completo de preenchimento de cores, luz e sombra.
        4. Gere uma paleta de 4-10 cores com códigos hexadecimais. IMPORTANTE: Inclua pelo menos uma cor com type 'Contorno' (geralmente preto ou cor muito escura) que será usada para o risco base. Para cada cor, forneça:
           - Nome da cor.
           - Linha Premium (ex: DMC Mouliné).
           - Linha Custo-Benefício (ex: Anchor ou Maxi).
           - Um link de busca real.
           - estimatedSkeins: NÚMERO DECIMAL (float) de meadas necessárias para um bastidor base de 12cm (ex: 0.2 para sobras, 1.0 para 1 meada, 2.5).
        5. stitches: Um guia visual detalhado dos pontos recomendados para a arte, SEPARADO para 'outline' (apenas contornos) e 'color' (preenchimento). Para cada ponto, forneça:
           - name: Nome do ponto (ex: Ponto Atrás, Ponto Cheio).
           - description: Breve explicação técnica de como fazer o ponto.
           - usage: Onde exatamente usar este ponto nesta arte específica.
           - icon: Escolha um destes valores exatos: 'backstitch', 'satin', 'french_knot', 'stem', 'chain', 'long_short', 'lazy_daisy', 'other'.
        6. timeEstimate: Forneça uma estimativa REAL de tempo (APENAS NÚMEROS INTEIROS, representando horas) para um bastidor base de 12cm, separada em 3 níveis de experiência (beginner, intermediate, advanced). Faça isso para o modo 'outline' e 'color'.
        7. instructions.tips: Dicas profissionais exclusivas para esta arte específica, SEPARADAS para 'outline' e 'color'.
        8. Preview descritivo e tecido sugerido.

        Retorne APENAS um JSON válido.
      `;

      const response = await withTimeout(
        ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { data: base64Data, mimeType } }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                analysis: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    focus: { type: Type.STRING },
                    complexity: { type: Type.STRING },
                    colors: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["type", "focus", "complexity", "colors"]
                },
                patterns: {
                  type: Type.OBJECT,
                  properties: {
                    outline: { type: Type.STRING },
                    color: { type: Type.STRING }
                  },
                  required: ["outline", "color"]
                },
                palette: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      hex: { type: Type.STRING },
                      type: { type: Type.STRING },
                      premiumLine: { type: Type.STRING },
                      budgetLine: { type: Type.STRING },
                      searchUrl: { type: Type.STRING },
                      estimatedSkeins: { type: Type.NUMBER }
                    },
                    required: ["name", "hex", "type", "premiumLine", "budgetLine", "searchUrl", "estimatedSkeins"]
                  }
                },
                conversions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      color: { type: Type.STRING },
                      dmc: { type: Type.STRING },
                      anchor: { type: Type.STRING },
                      maxi: { type: Type.STRING }
                    },
                    required: ["color", "dmc", "anchor", "maxi"]
                  }
                },
                stitches: {
                  type: Type.OBJECT,
                  properties: {
                    outline: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          description: { type: Type.STRING },
                          usage: { type: Type.STRING },
                          icon: { type: Type.STRING }
                        },
                        required: ["name", "description", "usage", "icon"]
                      }
                    },
                    color: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          description: { type: Type.STRING },
                          usage: { type: Type.STRING },
                          icon: { type: Type.STRING }
                        },
                        required: ["name", "description", "usage", "icon"]
                      }
                    }
                  },
                  required: ["outline", "color"]
                },
                instructions: {
                  type: Type.OBJECT,
                  properties: {
                    tips: {
                      type: Type.OBJECT,
                      properties: {
                        outline: { type: Type.ARRAY, items: { type: Type.STRING } },
                        color: { type: Type.ARRAY, items: { type: Type.STRING } }
                      },
                      required: ["outline", "color"]
                    }
                  },
                  required: ["tips"]
                },
                timeEstimate: {
                  type: Type.OBJECT,
                  properties: {
                    outline: {
                      type: Type.OBJECT,
                      properties: {
                        beginner: { type: Type.NUMBER },
                        intermediate: { type: Type.NUMBER },
                        advanced: { type: Type.NUMBER }
                      },
                      required: ["beginner", "intermediate", "advanced"]
                    },
                    color: {
                      type: Type.OBJECT,
                      properties: {
                        beginner: { type: Type.NUMBER },
                        intermediate: { type: Type.NUMBER },
                        advanced: { type: Type.NUMBER }
                      },
                      required: ["beginner", "intermediate", "advanced"]
                    }
                  },
                  required: ["outline", "color"]
                },
                fillingSuggestions: { type: Type.STRING },
                preview: { type: Type.STRING },
                size: { type: Type.STRING },
                fabric: { type: Type.STRING }
              },
              required: ["analysis", "patterns", "palette", "conversions", "instructions", "timeEstimate", "fillingSuggestions", "preview", "size", "fabric"]
            }
          }
        }),
        45000,
        "A análise está demorando mais que o esperado. Verifique sua conexão ou tente novamente."
      );

      if (!response.text) {
        throw new Error("Resposta vazia do modelo.");
      }

      const data = JSON.parse(response.text);
      setResult(data);

      // Step 2: Generate ONLY Line Art initially to save quota
      setIsGeneratingImage(true);
      try {
        const outlinePrompt = "Crie um risco de bordado técnico e minimalista (line art) em ALTA RESOLUÇÃO. REGRAS OBRIGATÓRIAS: 1. FOQUE APENAS NA PESSOA OU OBJETO PRINCIPAL. 2. REMOVA COMPLETAMENTE O CENÁRIO, FUNDO E QUALQUER ELEMENTO EXTERNO. 3. PROIBIDO QUALQUER TEXTO, LETRAS, NÚMEROS OU BARRAS DE INTERFACE. 4. NÃO COLOQUE NADA NO TOPO OU RODAPÉ DA IMAGEM (NADA DE BARRAS, NOTCH, ÍCONES DE BATERIA, WIFI, HORA OU BOTÕES DE NAVEGAÇÃO). 5. A imagem deve ser EXCLUSIVAMENTE linhas pretas finas sobre um fundo BRANCO PURO (#FFFFFF). 6. Não inclua molduras, bordas ou sombras. 7. Estilo: Desenho de contorno técnico e limpo. 8. NÃO simule uma captura de tela de celular.";

        const outlineResponse = await withTimeout(
        ai.models.generateContent({
          model: "gemini-2.5-flash-image",
          contents: [{ parts: [{ text: outlinePrompt }, { inlineData: { data: base64Data, mimeType } }] }]
        }),
        30000,
        "A geração do risco está demorando. Verifique sua internet."
      );

        const outlinePart = outlineResponse.candidates?.[0]?.content?.parts.find(p => p.inlineData);
        if (outlinePart?.inlineData?.data) {
          setGeneratedOutlineImage(`data:image/png;base64,${outlinePart.inlineData.data}`);
        }
      } catch (imgErr) {
        console.error("Erro ao gerar imagem do risco:", imgErr);
      } finally {
        setIsGeneratingImage(false);
      }

    } catch (err) {
      console.error("Erro na análise:", err);
      setError(err instanceof Error ? `Erro: ${err.message}` : "Ocorreu um erro ao analisar a imagem. Tente novamente.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadImage = () => {
    const currentImage = activeTab === 'outline' ? generatedOutlineImage : generatedColorImage;
    if (!currentImage) return;
    
    const link = document.createElement('a');
    link.href = currentImage;
    link.download = `arte-bordado-${activeTab}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const shareImage = async () => {
    const currentImage = activeTab === 'outline' ? generatedOutlineImage : generatedColorImage;
    if (!currentImage) return;

    try {
      const response = await fetch(currentImage);
      const blob = await response.blob();
      const file = new File([blob], `arte-bordado-${activeTab}.png`, { type: 'image/png' });

      if (navigator.share) {
        await navigator.share({
          title: 'Meu Risco de Bordado',
          text: 'Olha esse risco de bordado que eu gerei no Linha & Ponto!',
          files: [file]
        });
      } else {
        alert('Seu navegador não suporta compartilhamento direto. Baixe a imagem e compartilhe manualmente.');
      }
    } catch (error) {
      console.error('Erro ao compartilhar:', error);
    }
  };

  const generateColorVersion = async () => {
    if (!image) return;
    
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) return;

    setIsGeneratingColorImage(true);
    try {
      const ai = new GoogleGenAI({ apiKey });
      const mimeType = image.split(';')[0].split(':')[1] || "image/jpeg";
      const base64Data = image.split(',')[1];
      
      const colorPrompt = "Transforme a imagem em um BORDADO MANUAL REALISTA (Hand Embroidery) em ALTA RESOLUÇÃO. REGRAS OBRIGATÓRIAS: 1. FOQUE APENAS NA PESSOA OU OBJETO PRINCIPAL. 2. REMOVA QUALQUER ELEMENTO DE INTERFACE, TEXTO OU FUNDO COMPLEXO. 3. NÃO COLOQUE NADA NO TOPO OU RODAPÉ DA IMAGEM (NADA DE BARRAS, NOTCH, ÍCONES DE BATERIA, WIFI, HORA OU BOTÕES DE NAVEGAÇÃO). 4. Fundo 100% BRANCO PURO sólido. 5. A imagem deve parecer uma arte feita inteiramente de FIOS DE LINHA GROSSOS (textura 3D). 6. Simplifique detalhes como olhos e pele usando PONTOS DE BORDADO VISÍVEIS. 7. Sem texturas fotográficas, apenas textura de fios de algodão. 8. NÃO simule uma captura de tela de celular.";

      const colorResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{ parts: [{ text: colorPrompt }, { inlineData: { data: base64Data, mimeType } }] }]
      });

      const colorPart = colorResponse.candidates?.[0]?.content?.parts.find(p => p.inlineData);
      if (colorPart?.inlineData?.data) {
        setGeneratedColorImage(`data:image/png;base64,${colorPart.inlineData.data}`);
      }
    } catch (err) {
      console.error("Erro ao gerar versão colorida:", err);
    } finally {
      setIsGeneratingColorImage(false);
    }
  };

  return (
    <div className="min-h-screen font-sans selection:bg-violet-200 bg-[#0f0a1a] text-stone-100">
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-12 md:py-24">
        <div className="flex flex-col items-center text-center mb-20 space-y-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-violet-500/20 blur-3xl rounded-full" />
            <img 
              src={LOGO_URL} 
              alt="Linha & Ponto Logo" 
              className="w-32 h-32 md:w-40 md:h-40 object-contain rounded-full border-4 border-violet-500/30 shadow-2xl shadow-violet-500/20 relative z-10"
              referrerPolicy="no-referrer"
            />
          </motion.div>

          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 max-w-3xl"
          >
            <h1 className="font-serif text-6xl md:text-8xl font-bold text-white leading-[1] tracking-tighter">
              Linha & Ponto
            </h1>
            <p className="text-xl text-white leading-relaxed max-w-2xl mx-auto">
              Unindo a tradição do bordado manual com a sofisticação da inteligência artificial.
            </p>
          </motion.section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24">
          
          {/* Left Column: Upload */}
          <div className="lg:col-span-5 space-y-12">
            <div className="space-y-8">
              <div 
                className={`relative aspect-[4/5] md:aspect-square rounded-[3rem] border-2 transition-all overflow-hidden flex flex-col items-center justify-center gap-6 group shadow-2xl
                  ${image ? 'bg-violet-950/30 border-violet-500/20' : 'bg-white border-stone-200 hover:border-violet-500/50 cursor-pointer'}`}
                onClick={() => !image && fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  className="hidden" 
                  accept="image/*"
                />
                
                {image ? (
                  <>
                    <img src={image} alt="Original" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-sm">
                      <button 
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        className="p-5 bg-white text-stone-900 rounded-full hover:scale-110 transition-transform shadow-2xl"
                      >
                        <Camera className="w-7 h-7" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); analyzeImage(); }}
                        disabled={isAnalyzing}
                        className="p-5 bg-violet-500 text-white rounded-full hover:scale-110 transition-transform shadow-2xl disabled:opacity-50"
                      >
                        {isAnalyzing ? <Loader2 className="w-7 h-7 animate-spin" /> : <Sparkles className="w-7 h-7" />}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-28 h-28 bg-violet-500/5 rounded-[2.5rem] flex items-center justify-center text-violet-200 group-hover:scale-110 transition-transform duration-500 border border-violet-500/10">
                      <ImageIcon className="w-12 h-12" />
                    </div>
                    <div className="text-center space-y-3">
                      <p className="font-serif text-2xl font-bold text-stone-900">Sua Obra Começa Aqui</p>
                      <p className="text-sm text-stone-500">Toque para enviar sua fotografia</p>
                    </div>
                  </>
                )}
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm text-center"
                >
                  {error.includes('429') || error.includes('RESOURCE_EXHAUSTED') 
                    ? "O limite de uso gratuito da inteligência artificial foi atingido. Por favor, aguarde alguns minutos e tente novamente."
                    : error}
                </motion.div>
              )}

              {image && !result && !isAnalyzing && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={analyzeImage}
                  className="w-full py-6 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-[2rem] font-bold hover:from-violet-500 hover:to-indigo-500 transition-all shadow-2xl shadow-violet-900/20 flex items-center justify-center gap-4 text-xl"
                >
                  Gerar Guia de Bordado
                  <ChevronRight className="w-6 h-6" />
                </motion.button>
              )}

              {isAnalyzing && (
                <div className="space-y-8 px-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-violet-300/60 italic">Tecendo as linhas da sua obra...</span>
                    <span className="font-mono text-violet-400">Processando</span>
                  </div>
                  <div className="h-2 bg-violet-950 rounded-full overflow-hidden border border-violet-900/30">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-violet-500 to-pink-500"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 30, ease: "easeInOut" }}
                    />
                  </div>
                  <button 
                    onClick={cancelAnalysis}
                    className="w-full py-3 text-sm text-violet-400 hover:text-white transition-colors border border-violet-500/20 rounded-xl"
                  >
                    Cancelar Processamento
                  </button>
                </div>
              )}

              {result && !isAnalyzing && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-4 bg-stone-100 text-stone-600 rounded-2xl font-bold hover:bg-stone-200 transition-all flex items-center justify-center gap-3 border border-stone-200"
                >
                  <RefreshCw className="w-5 h-5" />
                  Enviar Nova Arte
                </motion.button>
              )}
            </div>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-7">
            <AnimatePresence mode="wait">
              {!result || isAnalyzing ? (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full min-h-[600px] rounded-[4rem] border border-stone-200 bg-white p-12 flex flex-col items-center justify-center text-center space-y-10 shadow-xl"
                >
                  <div className="relative">
                    <div className="w-40 h-40 bg-violet-500/5 rounded-full flex items-center justify-center text-violet-200 border border-violet-500/10">
                      {isAnalyzing ? <Loader2 className="w-16 h-16 animate-spin text-violet-500" /> : <Scissors className="w-16 h-16" />}
                    </div>
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.8, 0.3] }}
                      transition={{ repeat: Infinity, duration: 4 }}
                      className="absolute -top-4 -right-4 w-14 h-14 bg-violet-600/10 rounded-full flex items-center justify-center shadow-lg border border-violet-500/10"
                    >
                      <Heart className="w-7 h-7 text-violet-400 fill-violet-400/20" />
                    </motion.div>
                  </div>
                  <div className="space-y-4 max-w-md">
                    <h3 className="font-serif text-4xl font-bold text-stone-900 italic">
                      {isAnalyzing ? "Criando sua Arte..." : "Aguardando Inspiração"}
                    </h3>
                    <p className="text-stone-500 leading-relaxed text-lg">
                      {isAnalyzing 
                        ? "Nossa inteligência artificial está analisando cada detalhe e desenhando o seu risco de bordado."
                        : "Envie sua fotografia para que nossa inteligência artificial possa criar um guia de bordado exclusivo."}
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="result"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-16"
                >
                  {/* 1. Header Result */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-8 bg-white p-10 rounded-[3rem] border border-stone-200 shadow-xl">
                    <div className="flex items-center gap-6">
                      <div className="w-20 h-20 bg-gradient-to-br from-violet-600 to-pink-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-violet-500/20">
                        <CheckCircle2 className="w-10 h-10" />
                      </div>
                      <div>
                        <h3 className="font-serif text-3xl font-bold text-stone-900">Obra Concluída</h3>
                        <p className="text-stone-500 font-medium">Otimizado para {result.fabric}</p>
                      </div>
                    </div>
                  </div>

                  {/* Project Settings / Size Selector */}
                  <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-xl border border-stone-200 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4 text-center md:text-left">
                      <div className="w-14 h-14 bg-violet-100 rounded-full flex items-center justify-center text-violet-600 shrink-0 mx-auto md:mx-0">
                        <Scissors className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-stone-900 text-lg">Tamanho do Bastidor</h4>
                        <p className="text-sm text-stone-500">As estimativas de linha e tempo se ajustam automaticamente</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-stone-50 p-2 rounded-2xl border border-stone-100 w-full md:w-auto overflow-x-auto">
                      {HOOP_SIZES.map(size => (
                        <button
                          key={size}
                          onClick={() => setHoopSize(size)}
                          className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${hoopSize === size ? 'bg-violet-600 text-white shadow-md' : 'text-stone-600 hover:bg-stone-200'}`}
                        >
                          {size}cm
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Analysis Grid */}
                    <div className="flex flex-col gap-4">
                      {[
                        { label: "Tipo", value: result.analysis.type },
                        { label: "Foco", value: result.analysis.focus },
                        { label: "Dificuldade", value: result.analysis.complexity },
                        { label: "Tamanho", value: result.size }
                      ].map((item, i) => (
                        <div key={i} className="bg-white p-6 rounded-[1.5rem] border border-stone-200 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 shadow-sm text-left">
                          <p className="text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] min-w-[120px]">{item.label}</p>
                          <p className="font-serif font-bold text-stone-900 text-lg">{item.value}</p>
                        </div>
                      ))}
                    </div>

                  {/* 3. The Pattern Tabs */}
                  <div className="space-y-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-violet-900/30 pb-6">
                      <h4 className="font-serif text-3xl font-bold text-white">O Risco</h4>
                      <div className="flex bg-violet-950/50 p-1.5 rounded-full border border-violet-900/30">
                        <button 
                          onClick={() => setActiveTab('outline')}
                          className={`px-6 py-2.5 rounded-full text-xs font-bold transition-all ${activeTab === 'outline' ? 'bg-violet-600 text-white shadow-lg' : 'text-violet-400/40 hover:text-violet-300'}`}
                        >
                          Contornos
                        </button>
                        <button 
                          onClick={() => setActiveTab('color')}
                          className={`px-6 py-2.5 rounded-full text-xs font-bold transition-all ${activeTab === 'color' ? 'bg-violet-600 text-white shadow-lg' : 'text-violet-400/40 hover:text-violet-300'}`}
                        >
                          Colorido
                        </button>
                      </div>
                    </div>

                    <div className="relative min-h-[400px] md:min-h-[600px] rounded-[4rem] bg-[#1a0f2e] border border-violet-900/30 p-6 md:p-16 flex items-center justify-center text-center shadow-2xl overflow-visible group">
                      <motion.div 
                        key={activeTab}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full max-w-4xl space-y-8"
                      >
                        {(activeTab === 'outline' ? generatedOutlineImage : generatedColorImage) ? (
                          <div className="relative space-y-8">
                            <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-2xl relative">
                              
                              {/* Mockup Controls */}
                              <div className="flex flex-col sm:flex-row items-center justify-center mb-8">
                                <button
                                  onClick={() => setShowMockup(!showMockup)}
                                  className={`px-8 py-4 rounded-full font-bold text-sm transition-all shadow-lg flex items-center gap-3 ${showMockup ? 'bg-white text-stone-900 border border-stone-200' : 'bg-violet-100 text-violet-700 hover:bg-violet-200'}`}
                                >
                                  {showMockup ? 'Ver Arte Original' : 'Visualizar no Bastidor'}
                                </button>
                              </div>

                              {/* Image Display */}
                              {!showMockup ? (
                                <div className="space-y-6">
                                  <div className="relative rounded-2xl overflow-hidden bg-stone-50 border border-stone-100 shadow-inner">
                                    <img 
                                      src={(activeTab === 'outline' ? generatedOutlineImage : generatedColorImage) || ''} 
                                      alt="Risco de Bordado Final" 
                                      className="w-full max-h-[700px] object-contain"
                                    />
                                  </div>
                                  
                                  {/* Action Buttons - Always Visible */}
                                  <div className="grid grid-cols-3 gap-4">
                                    <button
                                      onClick={() => setIsFullscreen(true)}
                                      className="flex flex-col items-center justify-center gap-2 p-4 bg-stone-50 text-violet-600 rounded-2xl hover:bg-violet-50 transition-colors border border-stone-100"
                                    >
                                      <Maximize2 className="w-6 h-6" />
                                      <span className="text-[10px] font-bold uppercase tracking-wider">Ampliar</span>
                                    </button>
                                    <button
                                      onClick={downloadImage}
                                      className="flex flex-col items-center justify-center gap-2 p-4 bg-violet-600 text-white rounded-2xl hover:bg-violet-700 transition-colors shadow-lg shadow-violet-200"
                                    >
                                      <Download className="w-6 h-6" />
                                      <span className="text-[10px] font-bold uppercase tracking-wider">Baixar Arte</span>
                                    </button>
                                    <button
                                      onClick={shareImage}
                                      className="flex flex-col items-center justify-center gap-2 p-4 bg-stone-50 text-violet-600 rounded-2xl hover:bg-violet-50 transition-colors border border-stone-100"
                                    >
                                      <Share2 className="w-6 h-6" />
                                      <span className="text-[10px] font-bold uppercase tracking-wider">Enviar</span>
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                /* Hoop Viewer */
                                <div className="space-y-8">
                                  <div className="relative mx-auto w-full max-w-[450px] aspect-square">
                                    {/* Clasp (Fecho) */}
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-12 h-8 bg-stone-400 rounded-t-lg border-x-4 border-t-4 border-[#b08968] z-20 flex items-center justify-center">
                                      <div className="w-8 h-1 bg-stone-500 rounded-full"></div>
                                    </div>

                                    {/* Hoop */}
                                    <div className="w-full h-full rounded-full border-[16px] border-[#d4a373] shadow-[inset_0_0_20px_rgba(0,0,0,0.5),0_10px_30px_rgba(0,0,0,0.3)] overflow-hidden bg-white relative flex items-center justify-center transition-all duration-300">
                                      {/* Fabric texture overlay */}
                                      <div className="absolute inset-0 opacity-40 mix-blend-multiply pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>
                                      
                                      <img 
                                        src={(activeTab === 'outline' ? generatedOutlineImage : generatedColorImage) || ''} 
                                        alt="Risco de Bordado Final" 
                                        className={`${getHoopScale(hoopSize)} object-contain mix-blend-multiply transition-all duration-500 ease-in-out`}
                                      />
                                    </div>
                                  </div>

                                  {/* Action Buttons for Hoop - Always Visible */}
                                  <div className="grid grid-cols-3 gap-4">
                                    <button
                                      onClick={() => setIsFullscreen(true)}
                                      className="flex flex-col items-center justify-center gap-2 p-4 bg-stone-50 text-violet-600 rounded-2xl hover:bg-violet-50 transition-colors border border-stone-100"
                                    >
                                      <Maximize2 className="w-6 h-6" />
                                      <span className="text-[10px] font-bold uppercase tracking-wider">Ampliar</span>
                                    </button>
                                    <button
                                      onClick={downloadImage}
                                      className="flex flex-col items-center justify-center gap-2 p-4 bg-violet-600 text-white rounded-2xl hover:bg-violet-700 transition-colors shadow-lg shadow-violet-200"
                                    >
                                      <Download className="w-6 h-6" />
                                      <span className="text-[10px] font-bold uppercase tracking-wider">Baixar</span>
                                    </button>
                                    <button
                                      onClick={shareImage}
                                      className="flex flex-col items-center justify-center gap-2 p-4 bg-stone-50 text-violet-600 rounded-2xl hover:bg-violet-50 transition-colors border border-stone-100"
                                    >
                                      <Share2 className="w-6 h-6" />
                                      <span className="text-[10px] font-bold uppercase tracking-wider">Enviar</span>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            {/* Time Estimate UI */}
                            <div className="bg-white rounded-[2rem] p-8 border border-stone-200 shadow-sm mt-8">
                              <h4 className="font-serif text-xl font-bold text-stone-900 mb-6 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-violet-600" />
                                Tempo Estimado ({activeTab === 'outline' ? 'Apenas Contornos' : 'Preenchimento Completo'})
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 bg-stone-50 rounded-xl border border-stone-100">
                                  <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Iniciante</p>
                                  <p className="font-medium text-stone-800">{activeTab === 'outline' ? getDynamicTime(result.timeEstimate.outline.beginner) : getDynamicTime(result.timeEstimate.color.beginner)}</p>
                                </div>
                                <div className="p-4 bg-stone-50 rounded-xl border border-stone-100">
                                  <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Intermediário</p>
                                  <p className="font-medium text-stone-800">{activeTab === 'outline' ? getDynamicTime(result.timeEstimate.outline.intermediate) : getDynamicTime(result.timeEstimate.color.intermediate)}</p>
                                </div>
                                <div className="p-4 bg-stone-50 rounded-xl border border-stone-100">
                                  <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Avançado</p>
                                  <p className="font-medium text-stone-800">{activeTab === 'outline' ? getDynamicTime(result.timeEstimate.outline.advanced) : getDynamicTime(result.timeEstimate.color.advanced)}</p>
                                </div>
                              </div>
                            </div>

                            <div className="p-10 bg-white rounded-[2.5rem] border border-stone-200 text-left shadow-lg">
                              <p className="text-[10px] font-bold text-violet-600 uppercase tracking-[0.3em] mb-4">Guia de Execução Profissional</p>
                              <p className="text-xl text-stone-800 leading-relaxed italic font-serif">
                                {activeTab === 'outline' ? result.patterns.outline : result.patterns.color}
                              </p>
                            </div>
                          </div>
                        ) : activeTab === 'color' && !generatedColorImage && !isGeneratingColorImage ? (
                          <div className="space-y-8 py-20">
                            <div className="w-24 h-24 bg-violet-500/10 rounded-full flex items-center justify-center mx-auto text-violet-400 border border-violet-500/20">
                              <Palette className="w-10 h-10" />
                            </div>
                            <div className="space-y-3">
                              <p className="font-serif text-3xl text-white italic">
                                Simulação Colorida
                              </p>
                              <p className="text-violet-300/40 max-w-xs mx-auto">
                                Gere uma prévia realista de como seu bordado ficará com as cores aplicadas.
                              </p>
                            </div>
                            <button
                              onClick={generateColorVersion}
                              className="px-8 py-4 bg-violet-600 text-white rounded-full font-bold hover:bg-violet-700 transition-all shadow-lg flex items-center gap-3 mx-auto"
                            >
                              <Sparkles className="w-5 h-5" />
                              Gerar Simulação
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-8 py-20">
                            <div className="w-24 h-24 bg-violet-500/10 rounded-full flex items-center justify-center mx-auto text-violet-400 border border-violet-500/20">
                              <Loader2 className="w-12 h-12 animate-spin" />
                            </div>
                            <div className="space-y-3">
                              <p className="font-serif text-3xl text-white italic">
                                Desenhando sua obra...
                              </p>
                              <p className="text-violet-300/40 max-w-xs mx-auto">
                                Nossa inteligência está criando as linhas perfeitas para seu bordado.
                              </p>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    </div>
                  </div>

                  {/* 4. Palette & Conversion */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                      <div className="space-y-8">
                        <h4 className="font-serif text-3xl font-bold text-white">
                          {activeTab === 'outline' ? 'Linha de Contorno' : 'Paleta de Fios'}
                        </h4>
                        <div className="bg-white rounded-[3rem] p-10 border border-stone-200 shadow-xl space-y-8">
                          {(activeTab === 'outline' 
                            ? (result.palette.filter(c => c.type === 'Contorno').length > 0 
                                ? result.palette.filter(c => c.type === 'Contorno') 
                                : result.palette.slice(0, 1))
                            : result.palette
                          ).map((color, idx) => (
                            <div key={idx} className="flex items-center justify-between group">
                              <div className="flex items-center gap-6">
                                <div 
                                  className="w-16 h-16 rounded-[1.5rem] shadow-lg border border-black/5 transition-transform group-hover:scale-110" 
                                  style={{ backgroundColor: color.hex }}
                                />
                                <div className="space-y-1">
                                  <p className="font-bold text-stone-900 text-lg">{color.name}</p>
                                  <div className="flex flex-col gap-1">
                                    <p className="text-[10px] font-bold text-violet-600 uppercase tracking-widest">{color.type}</p>
                                    <p className="text-xs text-stone-500">Premium: {color.premiumLine}</p>
                                    <p className="text-xs text-stone-500">Econômica: {color.budgetLine}</p>
                                    <p className="text-xs font-medium text-amber-600 mt-1 bg-amber-50 inline-block px-2 py-0.5 rounded-md w-fit">
                                      Qtd: {getDynamicSkeins(color.estimatedSkeins)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-3">
                                <code className="text-xs font-mono text-violet-600 uppercase">{color.hex}</code>
                                <a 
                                  href={color.searchUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-[10px] font-bold text-violet-600 hover:text-violet-800 underline underline-offset-4 transition-colors"
                                >
                                  Buscar Linha
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-8">
                        <h4 className="font-serif text-3xl font-bold text-white">Conversão de Marcas</h4>
                        <div className="bg-white rounded-[3rem] p-10 border border-stone-200 shadow-xl overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left">
                              <thead>
                                <tr className="text-[10px] font-bold text-violet-600 uppercase tracking-[0.3em] border-b border-stone-100">
                                  <th className="pb-6">Cor</th>
                                  <th className="pb-6">DMC</th>
                                  <th className="pb-6">Anchor</th>
                                  <th className="pb-6">Maxi</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-stone-100">
                                {result.conversions.map((conv, idx) => (
                                  <tr key={idx} className="group">
                                    <td className="py-6 font-bold text-stone-900">{conv.color}</td>
                                    <td className="py-6 text-stone-500 font-mono text-sm">{conv.dmc}</td>
                                    <td className="py-6 text-stone-500 font-mono text-sm">{conv.anchor}</td>
                                    <td className="py-6 text-stone-500 font-mono text-sm">{conv.maxi}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>

                  {/* 5. Instructions - Dark Mode Premium */}
                  <section className="bg-white text-stone-900 rounded-[3rem] p-12 md:p-16 space-y-12 relative overflow-hidden shadow-xl border border-stone-100">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full -mr-32 -mt-32 blur-3xl" />
                    
                    <div className="flex items-center gap-4 relative">
                      <div className="w-12 h-12 bg-violet-500/10 rounded-2xl flex items-center justify-center">
                        <Palette className="w-6 h-6 text-violet-600" />
                      </div>
                      <h3 className="font-serif text-3xl font-bold italic">Guia de Pontos</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-16 relative">
                      <div className="space-y-8">
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.3em] mb-6">
                            Pontos Recomendados ({activeTab === 'outline' ? 'Contorno' : 'Preenchimento'})
                          </p>
                          <div className="space-y-6">
                            {(activeTab === 'outline' ? result.stitches.outline : result.stitches.color).map((stitch, idx) => (
                              <div key={idx} className="flex gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-100 hover:border-violet-200 hover:bg-violet-50/50 transition-colors">
                                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-violet-600 shadow-sm shrink-0">
                                  {getStitchIcon(stitch.icon)}
                                </div>
                                <div className="space-y-1">
                                  <p className="font-serif text-xl font-bold text-stone-900">{stitch.name}</p>
                                  <p className="text-sm text-stone-600 leading-relaxed">{stitch.description}</p>
                                  <p className="text-xs font-medium text-violet-600 mt-2 bg-violet-100/50 inline-block px-2 py-1 rounded-md">
                                    Onde usar: {stitch.usage}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-8">
                        <div className="space-y-4">
                          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.3em]">
                            Segredos de Bordado ({activeTab === 'outline' ? 'Contorno' : 'Preenchimento'})
                          </p>
                          <ul className="space-y-4">
                            {(activeTab === 'outline' ? result.instructions.tips.outline : result.instructions.tips.color).map((tip, idx) => (
                              <li key={idx} className="flex gap-4 text-stone-600 group">
                                <span className="text-stone-300 font-serif italic text-xl leading-none">{idx + 1}.</span>
                                <span className="leading-relaxed group-hover:text-stone-900 transition-colors">{tip}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="pt-12 border-t border-stone-100 flex flex-col md:flex-row items-center justify-between gap-8 relative">
                      <div className="flex items-center gap-8">
                        <div className="text-center md:text-left">
                          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Tecido Ideal</p>
                          <p className="text-xl font-serif italic text-stone-900">{result.fabric}</p>
                        </div>
                        <div className="w-px h-10 bg-stone-100 hidden md:block" />
                        <div className="text-center md:text-left">
                          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Áreas de Preenchimento</p>
                          <p className="text-sm text-stone-500 max-w-xs">{result.fillingSuggestions}</p>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* 6. Preview Text */}
                  <div className="bg-stone-50 rounded-[2rem] p-10 text-center space-y-4 border border-stone-100">
                    <h4 className="font-serif text-xl font-bold text-stone-900 italic">Visão Final</h4>
                    <p className="text-stone-500 leading-relaxed italic max-w-2xl mx-auto">
                      "{result.preview}"
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Premium Footer */}
      <footer className="bg-[#0f0a1a] border-t border-violet-900/30 py-12">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-8">
            <div className="flex gap-6">
              {[ImageIcon, Sparkles, Heart].map((Icon, i) => (
                <a key={i} href="#" className="w-12 h-12 rounded-full border border-violet-900/30 flex items-center justify-center text-violet-500/40 hover:text-white hover:border-violet-500 transition-all">
                  <Icon className="w-6 h-6" />
                </a>
              ))}
            </div>
            <p className="text-xs text-violet-500/30 font-mono uppercase tracking-[0.3em]">© 2026 Linha & Ponto</p>
          </div>
        </div>
      </footer>

      {/* Mobile Floating Action Button removed to avoid duplicate upload triggers */}

      {/* Fullscreen Image Modal */}
      <AnimatePresence>
        {isFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 md:p-8 backdrop-blur-md"
            onClick={() => setIsFullscreen(false)}
          >
            <button 
              className="absolute top-6 right-6 text-stone-900 bg-white hover:bg-stone-200 p-3 rounded-full shadow-2xl transition-all z-50"
              onClick={() => setIsFullscreen(false)}
            >
              <X className="w-6 h-6" />
            </button>
            <img 
              src={(activeTab === 'outline' ? generatedOutlineImage : generatedColorImage) || ''} 
              alt="Arte Ampliada" 
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
