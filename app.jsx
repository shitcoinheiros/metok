import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot } from 'firebase/firestore';
import { Zap, LayoutGrid, Trophy, ArrowUpRight, Loader2, Share2, Globe, ShieldCheck, Settings, AlertCircle, Key, RefreshCw, ImageOff } from 'lucide-react';

// --- CONFIGURAÇÃO FIREBASE ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'memetok-ipfs-pinata';

// --- NOVAS CREDENCIAIS PINATA (ATUALIZADAS) ---
const PINATA_GATEWAY = "jade-detailed-slug-469.mypinata.cloud";
const PINATA_API_KEY = "7b4b6d98c6d2911e3ab2";
const PINATA_SECRET = "f4ef366536787b24d8c8bae4bb5574fb132bd4c4a3268660599677c8719edae0"; 
const PINATA_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiIyYWEzYmZlZC05ZmFiLTRmMDYtYjAzYi1mZWZiMDI5OWQ3MDgiLCJlbWFpbCI6InNoaXRjb2luaGVpcm9zQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaW5fcG9saWN5Ijp7InJlZ2lvbnMiOlt7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6IkZSQTEifSx7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6Ik5ZQzEifV0sInZlcnNpb24iOjF9LCJtZmFfZW5hYmxlZCI6ZmFsc2UsInN0YXR1cyI6IkFDVElWRSJ9LCJhdXRoZW50aWNhdGlvblR5cGUiOiJzY29wZWRLZXkiLCJzY29wZWRLZXlLZXkiOiI3YjRiNmQ5OGM2ZDI5MTFlM2FiMiIsInNjb3BlZEtleVNlY3JldCI6ImY0ZWYzNjY1MzY3ODdiMjRkOGM4YmFlNGJiNTU3NGZiMTMyYmQ0YzRhMzI2ODY2MDU5OTY3N2M4NzE5ZWRhZTAiLCJleHAiOjE4MDEyNzMyMzN9.lUdaLbj_IpiRheeFaUPGNmEt8nbF_5hg0LoSBQNnM1U";    

export default function App() {
  const [user, setUser] = useState(null);
  const [memes, setMemes] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [loadingFeed, setLoadingFeed] = useState(true);

  // Autenticação Firebase
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Erro Auth:", err);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Sincronização em tempo real com Firestore
  useEffect(() => {
    if (!user) return;
    
    setLoadingFeed(true);
    const memesCol = collection(db, 'artifacts', appId, 'public', 'data', 'memes');
    
    const unsubscribe = onSnapshot(memesCol, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const sorted = docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setMemes(sorted);
      setLoadingFeed(false);
    }, (err) => {
      console.error("Erro Firestore:", err);
      setLoadingFeed(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const metadata = JSON.stringify({ 
        name: `MemeTok_${Date.now()}`,
        keyvalues: { origin: 'MemeTokApp' }
      });
      formData.append('pinataMetadata', metadata);
      formData.append('pinataOptions', JSON.stringify({ cidVersion: 0 }));

      // Usando JWT para upload (Mais seguro)
      const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PINATA_JWT.trim()}`
        },
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.details || "Erro no upload Pinata");
      }

      const data = await response.json();
      const ipfsCID = data.IpfsHash;

      // Guardar no Firestore
      const memesCol = collection(db, 'artifacts', appId, 'public', 'data', 'memes');
      await addDoc(memesCol, {
        url: `https://${PINATA_GATEWAY}/ipfs/${ipfsCID}`,
        cid: ipfsCID,
        asset: "IPFS_MEME",
        rewards: Math.floor(Math.random() * 999),
        creatorId: user.uid,
        timestamp: Date.now()
      });

      setShowStatus(true);
      setTimeout(() => setShowStatus(false), 3000);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setIsUploading(false);
      e.target.value = null;
    }
  };

  const handleImageError = (e, cid) => {
    const currentSrc = e.target.src;
    // Tenta gateway público se o privado falhar
    const fallbackUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;
    
    if (!currentSrc.includes('gateway.pinata.cloud')) {
      e.target.src = fallbackUrl;
    } else {
      e.target.style.display = 'none';
      const container = e.target.parentElement;
      if (container) {
        container.innerHTML = `<div class="text-white/20 text-center"><p class="text-[10px] font-mono">Erro ao carregar CID: ${cid}</p></div>`;
      }
    }
  };

  return (
    <div className="bg-black h-screen w-screen text-white overflow-hidden font-sans select-none">
      
      {showStatus && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[100] bg-yellow-400 text-black px-8 py-3 rounded-full font-black text-xs shadow-2xl animate-bounce">
          UPLOAD CONCLUÍDO! 🚀
        </div>
      )}

      {errorMessage && (
        <div className="fixed inset-0 z-[110] bg-black/95 flex items-center justify-center p-10 text-center">
          <div>
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-2xl font-black mb-2 italic">ERRO DE CREDENCIAIS</h3>
            <p className="text-white/40 text-xs mb-8">{errorMessage}</p>
            <button onClick={() => setErrorMessage(null)} className="bg-white text-black px-10 py-4 rounded-full font-black text-xs uppercase">Tentar Novamente</button>
          </div>
        </div>
      )}

      <div className="h-screen w-screen overflow-y-scroll snap-y snap-mandatory no-scrollbar scroll-smooth">
        {loadingFeed ? (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <RefreshCw className="w-8 h-8 text-yellow-400 animate-spin" />
            <span className="text-[10px] font-black tracking-[0.5em] opacity-30">SINCRONIZANDO GATEWAY...</span>
          </div>
        ) : memes.length > 0 ? (
          memes.map((m) => (
            <div key={m.id} className="h-screen w-screen snap-start relative flex items-center justify-center bg-black overflow-hidden">
              <div 
                className="absolute inset-0 bg-cover bg-center blur-[120px] opacity-20"
                style={{ backgroundImage: `url(${m.url})` }}
              />
              
              <div className="relative z-10 w-full h-full flex items-center justify-center p-4">
                <img 
                  src={m.url} 
                  className="max-h-[85vh] max-w-full object-contain shadow-[0_0_80px_rgba(0,0,0,0.5)] transition-opacity duration-500"
                  onLoad={(e) => e.target.style.opacity = 1}
                  onError={(e) => handleImageError(e, m.cid)}
                  style={{ opacity: 0 }}
                  alt="Meme"
                />
              </div>

              {/* HUD do App */}
              <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-end p-10 pb-44">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-white text-black px-2 py-0.5 text-[10px] font-black italic">IPFS CONTENT</span>
                    <span className="text-white/30 text-[8px] font-mono italic">CID: {m.cid.substring(0,16)}...</span>
                  </div>
                  <h2 className="text-6xl font-black italic tracking-tighter uppercase leading-[0.8] mb-1">MemeTok<br/>Eternal</h2>
                </div>

                <div className="absolute right-8 bottom-44 flex flex-col items-center gap-12 pointer-events-auto">
                  <div className="flex flex-col items-center group cursor-pointer active:scale-125 transition-all">
                    <div className="w-16 h-16 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center group-active:bg-yellow-400">
                      <Zap className="w-8 h-8 group-active:text-black group-active:fill-black" />
                    </div>
                    <span className="text-xs font-black mt-2 opacity-50">{m.rewards}</span>
                  </div>
                  <button className="w-16 h-16 bg-white text-black rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-all">
                    <Share2 className="w-7 h-7" />
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-6 opacity-20">
            <Globe className="w-20 h-20 animate-pulse" />
            <span className="text-xs font-black tracking-widest uppercase italic">Aguardando novo bloco...</span>
          </div>
        )}
      </div>

      {/* Botão de Upload */}
      <nav className="fixed bottom-12 left-0 right-0 flex justify-center items-center z-50">
        <label className="cursor-pointer group">
          <input type="file" className="hidden" onChange={handleUpload} accept="image/*" disabled={isUploading || !user} />
          <div className={`px-20 py-5 rounded-full font-black text-xs tracking-[0.5em] uppercase transition-all ${isUploading ? 'bg-white/10' : 'bg-white text-black hover:scale-105 active:scale-95 shadow-[0_20px_50px_rgba(255,255,255,0.2)]'}`}>
            {isUploading ? 'PROCESSANDO...' : 'UPLOAD IPFS'}
          </div>
        </label>
      </nav>

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
