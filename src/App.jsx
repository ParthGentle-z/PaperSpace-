import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, Library, NotebookPen, Lightbulb, Search, Plus, Sun, Moon,
  ChevronRight, ChevronLeft, X, ZoomIn, ZoomOut, Maximize2, FileText,
  Trash2, Download, HelpCircle, Sparkles, Menu, PanelLeftClose, PanelLeftOpen,
  FolderOpen, Cloud, Highlighter, MessageSquareText, RefreshCw, ExternalLink
} from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./styles.css";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const DB_NAME = "paperspace-db";
const STORE = "papers";
const BASE = import.meta.env.BASE_URL || "/";
const DRIVE = {
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY || "",
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || "",
  appId: import.meta.env.VITE_GOOGLE_PROJECT_NUMBER || ""
};
const concepts = [
  {term:"Persistence diagram",area:"Topological data analysis",definition:"A persistence diagram records when topological features appear and disappear as a threshold changes. Each point represents a feature using its birth and death values.",intuition:"Imagine sweeping a water level through a landscape. A connected region appears at one level and may merge into another region later. The diagram records that lifetime.",why:"It helps distinguish stable, long-lived structure from short-lived features that may be noise.",example:"In a 3D tumour mask, connected components can be tracked as a distance threshold changes."},
  {term:"Bottleneck distance",area:"Diagram comparison",definition:"The bottleneck distance compares two persistence diagrams by finding a matching that minimises the largest individual matching cost. Points may also match to the diagonal.",intuition:"It asks: after the best possible matching, what is the single worst mismatch left?",why:"It is sensitive to the largest discrepancy rather than the total accumulated discrepancy.",example:"A small bottleneck distance suggests no single topological feature differs dramatically between the two diagrams."},
  {term:"Wasserstein distance",area:"Diagram comparison",definition:"The Wasserstein distance compares diagrams by accumulating matching costs across all matched points, with the p-th root applied for p-Wasserstein distance.",intuition:"Instead of looking only at the worst mismatch, it adds up the cost of many mismatches.",why:"It captures distributed differences across a diagram.",example:"Several moderate shifts can produce a noticeable Wasserstein distance even when no single shift is extreme."},
  {term:"Scalar field",area:"Scientific visualization",definition:"A scalar field assigns one numerical value to every point in a domain, such as intensity at each voxel in a 3D MRI volume.",intuition:"Imagine a 3D grid where every voxel stores one number. The collection of those numbers is the scalar field.",why:"Topological methods study how the shape of data changes as a threshold is swept through these values.",example:"MRI intensity, signed distance to a tumour boundary, or vessel density can be treated as scalar fields."},
  {term:"Merge tree",area:"Topological descriptors",definition:"A merge tree records how connected components of a scalar field are born and merge as the scalar threshold changes.",intuition:"Imagine islands appearing as sea level falls, then joining into larger landmasses. The tree records those joining events.",why:"It summarises connectivity structure across thresholds.",example:"Compare merge trees from two brain volumes to study changes in the organisation of high-intensity regions."},
  {term:"Betti number",area:"Algebraic topology",definition:"A Betti number counts topological features: components (β0), loops (β1), and voids (β2) in common 3D settings.",intuition:"β0 counts separate pieces, β1 counts tunnels, and β2 counts enclosed cavities.",why:"Betti numbers give a compact summary of connectivity and holes.",example:"A 3D segmentation with one connected component and two tunnels has β0=1 and β1=2."}
];

function openDB() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open(DB_NAME,1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE,{keyPath:"id"});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function dbAll(db) {
  return new Promise((resolve,reject) => {
    const request = db.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function dbPut(db,item) {
  return new Promise((resolve,reject) => {
    const request = db.transaction(STORE,"readwrite").objectStore(STORE).put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
function dbDelete(db,id) {
  return new Promise((resolve,reject) => {
    const request = db.transaction(STORE,"readwrite").objectStore(STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
const dateLabel = value => new Date(value).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});
const readJson = (key,fallback) => {
  try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value ?? fallback; }
  catch { return fallback; }
};
function loadScript(src) {
  return new Promise((resolve,reject) => {
    const existing = document.querySelector('script[data-paperspace-src="'+src+'"]');
    if (existing) { if (existing.dataset.loaded === "true") resolve(); else { existing.addEventListener("load",resolve,{once:true}); existing.addEventListener("error",reject,{once:true}); } return; }
    const script = document.createElement("script");
    script.src = src; script.async = true; script.defer = true; script.dataset.paperspaceSrc = src;
    script.onload = () => { script.dataset.loaded = "true"; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function App() {
  const [view,setView] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("p");
    if (requested) window.history.replaceState({}, "", requested);
    return window.location.pathname.replace(/\/$/,"").endsWith("/Reading") ? "reader" : "library";
  });
  const [db,setDb] = useState(null);
  const [papers,setPapers] = useState([]);
  const [openIds,setOpenIds] = useState(() => readJson("ps-open-paper-ids",[]));
  const [activeId,setActiveId] = useState(() => localStorage.getItem("ps-active-paper-id") || "");
  const [pdf,setPdf] = useState(null);
  const [pdfError,setPdfError] = useState("");
  const [page,setPage] = useState(1);
  const [zoom,setZoom] = useState(1);
  const [fit,setFit] = useState(true);
  const [query,setQuery] = useState("");
  const [termQuery,setTermQuery] = useState("");
  const [selectedConcept,setSelectedConcept] = useState(concepts[0]);
  const [note,setNote] = useState("");
  const [selection,setSelection] = useState(null);
  const [readerTab,setReaderTab] = useState("notes");
  const [sidebarVisible,setSidebarVisible] = useState(() => localStorage.getItem("ps-sidebar") !== "hidden");
  const [sidebarCollapsed,setSidebarCollapsed] = useState(() => localStorage.getItem("ps-sidebar-collapsed") === "true");
  const [mobileSidebar,setMobileSidebar] = useState(false);
  const [dark,setDark] = useState(() => localStorage.getItem("ps-theme") !== "light");
  const [guide,setGuide] = useState(true);
  const [toast,setToast] = useState("");
  const [driveBusy,setDriveBusy] = useState(false);
  const [driveMessage,setDriveMessage] = useState("");
  const [driveFolder,setDriveFolder] = useState(() => readJson("ps-drive-folder",null));
  const canvasHost = useRef(null);
  const driveTokenRef = useRef(null);
  const toastTimer = useRef(null);

  const active = papers.find(p => p.id === activeId) || null;
  const notes = useMemo(() => papers.flatMap(p => (p.notes || []).map(n => ({...n,paperName:p.name,paperId:p.id}))),[papers]);
  const filtered = useMemo(() => papers.filter(p => p.name.toLowerCase().includes(query.toLowerCase())),[papers,query]);
  const matchingConcepts = useMemo(() => concepts.filter(c => (c.term+" "+c.area).toLowerCase().includes(termQuery.toLowerCase())),[termQuery]);
  const openPapers = openIds.map(id => papers.find(p => p.id === id)).filter(Boolean);

  const notify = useCallback(message => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""),2500);
  },[]);
  const refresh = useCallback(async () => {
    if (db) setPapers(await dbAll(db));
  },[db]);

  useEffect(() => {
    openDB().then(async database => { setDb(database); setPapers(await dbAll(database)); })
      .catch(() => notify("PaperSpace could not open local browser storage."));
  },[notify]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("ps-theme",dark ? "dark" : "light");
  },[dark]);
  useEffect(() => { localStorage.setItem("ps-open-paper-ids",JSON.stringify(openIds)); },[openIds]);
  useEffect(() => { if (activeId) localStorage.setItem("ps-active-paper-id",activeId); else localStorage.removeItem("ps-active-paper-id"); },[activeId]);
  useEffect(() => { localStorage.setItem("ps-sidebar",sidebarVisible ? "visible" : "hidden"); },[sidebarVisible]);
  useEffect(() => { localStorage.setItem("ps-sidebar-collapsed",String(sidebarCollapsed)); },[sidebarCollapsed]);
  useEffect(() => { localStorage.setItem("ps-drive-folder",JSON.stringify(driveFolder)); },[driveFolder]);

  const setRoute = useCallback((route,replace=false) => {
    const target = route === "reader" ? BASE+"Reading" : BASE;
    if (window.location.pathname !== target) {
      if (replace) window.history.replaceState({}, "", target);
      else window.history.pushState({}, "", target);
    }
    setView(route);
    setMobileSidebar(false);
  },[]);
  useEffect(() => {
    const onPop = () => setView(window.location.pathname.replace(/\/$/,"").endsWith("/Reading") ? "reader" : "library");
    window.addEventListener("popstate",onPop);
    return () => window.removeEventListener("popstate",onPop);
  },[]);

  const addOpenId = useCallback(id => {
    setOpenIds(current => current.includes(id) ? current : [...current,id]);
    setActiveId(id);
    setRoute("reader");
  },[setRoute]);

  const openPaper = useCallback(async paper => {
    if (!paper) return;
    addOpenId(paper.id);
    setPdf(null); setPdfError(""); setPage(1); setSelection(null);
    try {
      const loaded = await pdfjs.getDocument({data:await paper.blob.arrayBuffer()}).promise;
      setPdf(loaded);
    } catch (error) {
      console.error(error);
      setPdfError("This PDF could not be opened. It may be damaged or stored in an unsupported format.");
    }
  },[addOpenId]);

  useEffect(() => {
    if (!db || view !== "reader" || !activeId || pdf) return;
    const paper = papers.find(item => item.id === activeId);
    if (paper?.blob) {
      openPaper(paper);
    }
  // The selected document is intentionally the trigger here; openPaper owns PDF loading.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[db,view,activeId,papers.length]);

  const closeOpenPaper = useCallback(id => {
    const remaining = openIds.filter(value => value !== id);
    setOpenIds(remaining);
    if (id === activeId) {
      const nextId = remaining[remaining.length-1] || "";
      setActiveId(nextId);
      setPdf(null); setSelection(null); setPage(1);
      if (!nextId) setRoute("library");
    }
  },[openIds,activeId,setRoute]);

  const removePaper = useCallback(async id => {
    if (!db || !window.confirm("Remove this PDF and its notes/highlights from this browser?")) return;
    await dbDelete(db,id);
    setOpenIds(ids => ids.filter(value => value !== id));
    if (activeId === id) { setActiveId(""); setPdf(null); setRoute("library"); }
    await refresh();
    notify("Paper removed from this browser.");
  },[db,activeId,refresh,notify,setRoute]);

  const saveNote = useCallback(async () => {
    if (!db || !active || !note.trim()) return;
    const updated = {...active,notes:[...(active.notes || []),{id:crypto.randomUUID(),page,text:note.trim(),created:Date.now()}]};
    await dbPut(db,updated); setPapers(items => items.map(item => item.id === updated.id ? updated : item));
    setNote(""); notify("Note saved on page "+page+".");
  },[db,active,note,page,notify]);

  const saveHighlight = useCallback(async () => {
    if (!db || !active || !selection) return;
    const updated = {...active,highlights:[...(active.highlights || []),{id:crypto.randomUUID(),...selection,color:"#ffe36b",created:Date.now()}]};
    await dbPut(db,updated);
    setPapers(items => items.map(item => item.id === updated.id ? updated : item));
    setSelection(null); window.getSelection()?.removeAllRanges();
    notify("Highlight saved.");
  },[db,active,selection,notify]);

  const removeHighlight = useCallback(async id => {
    if (!db || !active) return;
    const updated = {...active,highlights:(active.highlights || []).filter(item => item.id !== id)};
    await dbPut(db,updated);
    setPapers(items => items.map(item => item.id === updated.id ? updated : item));
    notify("Highlight removed. You can select the passage again later.");
  },[db,active,notify]);

  const undoLastHighlight = useCallback(async () => {
    if (!active?.highlights?.length) return;
    const last = [...active.highlights].sort((a,b) => b.created-a.created)[0];
    await removeHighlight(last.id);
  },[active,removeHighlight]);

  const captureSelection = useCallback(() => {
    const selected = window.getSelection();
    const text = selected?.toString().trim();
    if (!text || !canvasHost.current || !selected.rangeCount) return;
    const range = selected.getRangeAt(0);
    const startNode = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const sheet = startNode?.closest(".pdf-sheet");
    if (!sheet) return;
    const layer = sheet.querySelector(".pdf-text-layer");
    if (!layer) return;
    const origin = layer.getBoundingClientRect();
    const rects = Array.from(range.getClientRects()).map(rect => ({
      x:rect.left-origin.left, y:rect.top-origin.top, w:rect.width, h:rect.height
    })).filter(rect => rect.w > 0 && rect.h > 0);
    if (rects.length) setSelection({text,page:Number(sheet.dataset.page),rects});
  },[]);

  const scrollToPage = useCallback(target => {
    const pageElement = canvasHost.current?.querySelector('[data-page="'+target+'"]');
    if (pageElement) pageElement.scrollIntoView({behavior:"smooth",block:"start"});
    setPage(target);
  },[]);

  // Render the document as one continuous stack. ResizeObserver keeps it fitted to the available reader width.
  useEffect(() => {
    if (!pdf || !canvasHost.current) return;
    let cancelled = false;
    const tasks = [];
    const root = canvasHost.current;
    const render = async () => {
      root.innerHTML = "";
      try {
        for (let number=1; number<=pdf.numPages; number++) {
          if (cancelled) return;
          const pdfPage = await pdf.getPage(number);
          const baseViewport = pdfPage.getViewport({scale:1});
          const available = Math.max(240,root.clientWidth-44);
          const scale = fit ? Math.min(2.5,available/baseViewport.width) : zoom;
          const viewport = pdfPage.getViewport({scale});
          const sheet = document.createElement("article");
          sheet.className = "pdf-sheet"; sheet.dataset.page = String(number);
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          const ratio = Math.min(window.devicePixelRatio || 1,2);
          canvas.width = Math.floor(viewport.width*ratio);
          canvas.height = Math.floor(viewport.height*ratio);
          canvas.style.width = viewport.width+"px"; canvas.style.height = viewport.height+"px";
          context.setTransform(ratio,0,0,ratio,0,0);
          sheet.appendChild(canvas); root.appendChild(sheet);
          const task = pdfPage.render({canvasContext:context,viewport});
          tasks.push(task); await task.promise;
          if (cancelled) return;
          const textContent = await pdfPage.getTextContent();
          const layer = document.createElement("div");
          layer.className = "pdf-text-layer";
          layer.style.width = viewport.width+"px"; layer.style.height = viewport.height+"px";
          for (const item of textContent.items) {
            if (!item.str || !item.transform) continue;
            const transform = pdfjs.Util.transform(viewport.transform,item.transform);
            const height = Math.hypot(transform[2],transform[3]);
            const span = document.createElement("span");
            span.textContent = item.str;
            span.style.left = transform[4]+"px";
            span.style.top = (transform[5]-height)+"px";
            span.style.fontSize = height+"px";
            span.style.fontFamily = item.fontName || "sans-serif";
            span.style.transform = "scaleX("+Math.max(.1,Math.hypot(transform[0],transform[1])/(height||1))+")";
            span.style.transformOrigin = "left top";
            layer.appendChild(span);
          }
          sheet.appendChild(layer);
          for (const highlight of (active?.highlights || []).filter(item => item.page === number)) {
            for (const rect of highlight.rects || []) {
              const mark = document.createElement("div");
              mark.className = "saved-highlight";
              mark.style.background = highlight.color || "#ffe36b";
              Object.assign(mark.style,{left:rect.x+"px",top:rect.y+"px",width:rect.w+"px",height:rect.h+"px"});
              layer.appendChild(mark);
            }
          }
        }
      } catch (error) {
        if (error?.name !== "RenderingCancelledException") console.error("PDF render error",error);
      }
    };
    const observer = new ResizeObserver(() => { if (!cancelled) render(); });
    observer.observe(root);
    render();
    const onScroll = () => {
      const sheets = Array.from(root.querySelectorAll(".pdf-sheet"));
      if (!sheets.length) return;
      const line = root.getBoundingClientRect().top + 30;
      let nearest = sheets[0], distance = Infinity;
      for (const sheet of sheets) {
        const currentDistance = Math.abs(sheet.getBoundingClientRect().top-line);
        if (currentDistance < distance) { nearest = sheet; distance = currentDistance; }
      }
      setPage(Number(nearest.dataset.page));
    };
    root.addEventListener("scroll",onScroll,{passive:true});
    return () => { cancelled = true; observer.disconnect(); tasks.forEach(task => task.cancel?.()); root.removeEventListener("scroll",onScroll); };
  },[pdf,zoom,fit,activeId,active?.highlights?.length,active?.highlights?.map(h=>h.id).join(",")]);

  const addLocalFiles = useCallback(async files => {
    if (!db) return;
    for (const file of Array.from(files)) {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) continue;
      await dbPut(db,{id:crypto.randomUUID(),name:file.name,blob:file,added:Date.now(),notes:[],highlights:[],provider:"local"});
    }
    await refresh(); notify("PDFs added to your private library.");
  },[db,refresh,notify]);

  const exportNotes = useCallback(() => {
    const payload = JSON.stringify({exportedAt:new Date().toISOString(),papers:papers.map(({blob,...item})=>item)},null,2);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([payload],{type:"application/json"}));
    link.download = "paperspace-research-backup.json"; link.click(); URL.revokeObjectURL(link.href);
  },[papers]);

  const importDriveFolder = useCallback(async folder => {
    if (!driveTokenRef.current) throw new Error("Google Drive access token is missing.");
    const token = driveTokenRef.current;
    const q = encodeURIComponent("'"+folder.id+"' in parents and mimeType='application/pdf' and trashed=false");
    const response = await fetch("https://www.googleapis.com/drive/v3/files?q="+q+"&fields=files(id,name,mimeType,modifiedTime,size)&pageSize=100",{
      headers:{Authorization:"Bearer "+token}
    });
    if (!response.ok) throw new Error("Drive folder could not be read. Check that the selected folder is shared with PaperSpace.");
    const data = await response.json();
    if (!data.files?.length) { setDriveMessage("No PDFs were found directly inside that folder."); return; }
    for (const file of data.files) {
      const media = await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(file.id)+"?alt=media",{headers:{Authorization:"Bearer "+token}});
      if (!media.ok) continue;
      const blob = await media.blob();
      await dbPut(db,{id:"drive-"+file.id,name:file.name,blob,added:Date.now(),notes:[],highlights:[],provider:"google-drive",driveId:file.id,driveFolderId:folder.id});
    }
    await refresh();
    setDriveMessage("Imported "+data.files.length+" PDF(s) from “"+folder.name+"”. Local copies are stored in this browser.");
    notify("Google Drive folder imported.");
  },[db,refresh,notify]);

  const connectGoogleDrive = useCallback(async () => {
    if (!DRIVE.apiKey || !DRIVE.clientId || !DRIVE.appId) {
      setDriveMessage("Google Drive setup is incomplete. Add the API key, OAuth client ID and Cloud project number in GitHub Actions variables first.");
      return;
    }
    setDriveBusy(true); setDriveMessage("");
    try {
      await Promise.all([
        loadScript("https://apis.google.com/js/api.js"),
        loadScript("https://accounts.google.com/gsi/client")
      ]);
      await new Promise(resolve => window.gapi.load("picker",{callback:resolve}));
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id:DRIVE.clientId,
        scope:"https://www.googleapis.com/auth/drive.file",
        callback:async response => {
          if (response.error) { setDriveBusy(false); setDriveMessage("Google authorisation was not completed."); return; }
          driveTokenRef.current = response.access_token;
          const pickerView = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
            .setIncludeFolders(true).setSelectFolderEnabled(true);
          const picker = new window.google.picker.PickerBuilder()
            .addView(pickerView).setOAuthToken(response.access_token)
            .setDeveloperKey(DRIVE.apiKey).setAppId(DRIVE.appId)
            .setTitle("Choose a PaperSpace research folder")
            .setCallback(async data => {
              if (data.action !== window.google.picker.Action.PICKED) { setDriveBusy(false); return; }
              const doc = data.docs?.[0];
              if (!doc) { setDriveBusy(false); return; }
              const folder = {id:doc.id,name:doc.name || "Selected Drive folder"};
              setDriveFolder(folder);
              try { await importDriveFolder(folder); }
              catch (error) { setDriveMessage(error.message || "Drive import failed."); }
              finally { setDriveBusy(false); }
            }).build();
          picker.setVisible(true);
        }
      });
      tokenClient.requestAccessToken({prompt:"consent"});
    } catch (error) {
      console.error(error); setDriveBusy(false);
      setDriveMessage("Google Picker could not be loaded. Check API activation and authorised website origins.");
    }
  },[importDriveFolder]);

  const closeSidebarPaper = id => closeOpenPaper(id);
  const activeHighlights = active?.highlights || [];
  const activeNotes = active?.notes || [];

  return (
    <div className={"app-shell "+(view === "reader" ? "reader-mode " : "")+(sidebarVisible ? "" : "sidebar-hidden")+(sidebarCollapsed ? " sidebar-collapsed" : "")}>
      {sidebarVisible && <aside className={"sidebar "+(mobileSidebar ? "mobile-open" : "")}>
        <div className="brand"><span className="brand-mark">P</span><span className="brand-name">PaperSpace</span><span className="brand-beta">RESEARCH DESK</span></div>
        <nav className="nav-list">
          <button className={"nav-item "+(view === "library" ? "active" : "")} onClick={() => setRoute("library")}><Library size={18}/><span>Library</span></button>
          <button className={"nav-item "+(view === "notes" ? "active" : "")} onClick={() => setRoute("notes")}><NotebookPen size={18}/><span>Research notes</span></button>
          <button className={"nav-item "+(view === "concepts" ? "active" : "")} onClick={() => setRoute("concepts")}><Lightbulb size={18}/><span>Concept desk</span></button>
        </nav>
        <section className="open-paper-section">
          <div className="sidebar-section-title"><span>OPEN PAPERS</span><span className="count-pill">{openPapers.length}</span></div>
          {openPapers.length ? openPapers.map(paper => (
            <div className={"open-paper-item "+(paper.id === activeId && view === "reader" ? "selected" : "")} key={paper.id}>
              <button className="open-paper-name" title={paper.name} onClick={() => openPaper(paper)}><FileText size={15}/><span>{paper.name}</span></button>
              <button className="open-paper-close" aria-label={"Close "+paper.name} title="Close from open papers" onClick={() => closeSidebarPaper(paper.id)}><X size={13}/></button>
            </div>
          )) : <p className="empty-open-papers">Open a paper and it will stay listed here.</p>}
        </section>
        <div className="sidebar-bottom">
          <div className="privacy-mark"><span/> LOCAL-FIRST STORAGE</div>
          <p>Your PDFs, notes and highlights stay in this browser. They are not uploaded to GitHub.</p>
        </div>
      </aside>}

      {mobileSidebar && sidebarVisible && <button className="sidebar-scrim" onClick={() => setMobileSidebar(false)} aria-label="Close navigation"/>}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn sidebar-toggle" title={sidebarVisible ? (sidebarCollapsed ? "Expand menu" : "Hide menu") : "Show menu"}
              onClick={() => { if (window.matchMedia("(max-width: 820px)").matches) { if (!sidebarVisible) { setSidebarVisible(true); setMobileSidebar(true); } else setMobileSidebar(v=>!v); } else { setSidebarVisible(v=>!v); } }}>
              {sidebarVisible ? (sidebarCollapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>) : <Menu size={17}/>}
            </button>
            <div className="breadcrumb"><span>WORKSPACE</span><b>/</b><strong>{view === "reader" ? "Reading" : view === "library" ? "Library" : view === "notes" ? "Research notes" : "Concept desk"}</strong></div>
          </div>
          <div className="top-actions">
            <button className="icon-btn theme-toggle" onClick={() => setDark(v=>!v)}>{dark ? <Sun size={16}/> : <Moon size={16}/>}<span>{dark ? "Light mode" : "Dark mode"}</span></button>
            <button className="button button-primary" onClick={() => document.getElementById("paper-upload")?.click()}><Plus size={16}/><span>Add paper</span></button>
            <input id="paper-upload" hidden type="file" accept="application/pdf,.pdf" multiple onChange={e => { addLocalFiles(e.target.files); e.target.value=""; }}/>
          </div>
        </header>

        {view === "library" && <div className="content library-content">
          <section className="page-heading">
            <div><div className="eyebrow">YOUR RESEARCH, IN ONE PLACE</div><h1>Research library</h1><p>Manage your papers, open multiple documents, and keep your reading organised.</p></div>
            <div className="heading-note"><BookOpen size={17}/>Private by default · Stored on this device</div>
          </section>
          <div className="stats-grid">
            <div className="stat-card"><span>LIBRARY</span><strong>{papers.length}</strong><small>papers saved</small></div>
            <div className="stat-card"><span>YOUR THINKING</span><strong>{notes.length}</strong><small>reading notes</small></div>
            <div className="stat-card"><span>OPEN NOW</span><strong>{openPapers.length}</strong><small>active reading files</small></div>
          </div>
          <section className="drive-card">
            <div className="drive-card-icon"><Cloud size={21}/></div>
            <div className="drive-card-copy"><h2>Google Drive folder</h2><p>{driveFolder ? "Selected folder: "+driveFolder.name : "Optionally import PDFs from one folder you choose in your Google Drive."}</p>{driveMessage && <small className="drive-message">{driveMessage}</small>}</div>
            <button className="button button-secondary" onClick={connectGoogleDrive} disabled={driveBusy}><FolderOpen size={16}/>{driveBusy ? "Connecting…" : driveFolder ? "Choose folder" : "Connect Drive"}</button>
          </section>
          <div className="section-header">
            <div><h2>Your collection</h2><p>Search, open or remove papers from this browser.</p></div>
            <label className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search paper titles"/></label>
          </div>
          <div className="paper-grid">
            {filtered.map(paper => <article className="paper-card" key={paper.id}>
              <div className="paper-card-top"><span className="pdf-icon"><FileText size={21}/></span><button className="quiet-icon" onClick={() => removePaper(paper.id)} title="Remove from library"><Trash2 size={16}/></button></div>
              <h3>{paper.name}</h3>
              <p className="paper-meta">{paper.provider === "google-drive" ? "Google Drive import" : "Added "+dateLabel(paper.added)}</p>
              <div className="paper-card-bottom"><span>{(paper.notes || []).length} notes · {(paper.highlights || []).length} highlights</span><button className="button button-small" onClick={() => openPaper(paper)}>Open paper <ChevronRight size={15}/></button></div>
            </article>)}
            {!filtered.length && <div className="empty-state"><div className="empty-icon"><Library size={24}/></div><h3>{papers.length ? "No matching papers" : "Your research library starts here"}</h3><p>{papers.length ? "Try another title search." : "Add a PDF to start reading, annotating and collecting research ideas."}</p><button className="button button-primary" onClick={() => document.getElementById("paper-upload")?.click()}><Plus size={16}/> Add your first paper</button></div>}
          </div>
          <div className="drive-setup-note"><HelpCircle size={15}/><span>Google Drive requires a Google Cloud project with the Picker and Drive APIs enabled, an API key, a Web OAuth client ID and the project number. Configure these as GitHub Actions variables to enable the connection.</span></div>
        </div>}

        {view === "reader" && <div className="reader-content">
          <div className="reader-headline">
            <div className="reader-title-line"><span className="eyebrow">READING WORKSPACE</span><span className="reader-document-title" title={active?.name || "No paper selected"}>{active?.name || "Choose an open paper"}</span></div>
            <div className="reader-headline-actions"><span className="reader-page-status">{pdf ? "Page "+page+" of "+pdf.numPages : "Select an open paper to begin"}</span><button className="button button-secondary button-small" onClick={() => setRoute("library")}><X size={14}/> Library</button></div>
          </div>
          {openPapers.length > 0 && <div className="reader-tabs" aria-label="Open documents">
            {openPapers.map(paper => <div className={"reader-tab "+(paper.id === activeId ? "active" : "")} key={paper.id}>
              <button onClick={() => openPaper(paper)} title={paper.name}><FileText size={14}/><span>{paper.name}</span></button>
              <button className="reader-tab-close" onClick={() => closeOpenPaper(paper.id)} title="Close paper"><X size={13}/></button>
            </div>)}
          </div>}
          <div className="reader-layout">
            <section className="pdf-panel">
              <div className="pdf-toolbar">
                <div className="toolbar-page">
                  <button className="icon-btn" disabled={!pdf || page <= 1} onClick={() => scrollToPage(Math.max(1,page-1))}><ChevronLeft size={17}/></button>
                  <span>{pdf ? page+" / "+pdf.numPages : "— / —"}</span>
                  <button className="icon-btn" disabled={!pdf || page >= pdf.numPages} onClick={() => scrollToPage(Math.min(pdf?.numPages || page,page+1))}><ChevronRight size={17}/></button>
                </div>
                <div className="toolbar-tools">
                  {selection && <button className="tool-btn highlight-action" onClick={saveHighlight}><Highlighter size={14}/> Save highlight</button>}
                  <button className={"tool-btn "+(fit ? "selected" : "")} onClick={() => setFit(true)}><Maximize2 size={14}/> Fit width</button>
                  <button className="icon-btn" disabled={!pdf} onClick={() => {setFit(false);setZoom(value=>Math.max(.55,value-.15));}} title="Zoom out"><ZoomOut size={16}/></button>
                  <span className="zoom-value">{fit ? "Fit" : Math.round(zoom*100)+"%"}</span>
                  <button className="icon-btn" disabled={!pdf} onClick={() => {setFit(false);setZoom(value=>Math.min(2.5,value+.15));}} title="Zoom in"><ZoomIn size={16}/></button>
                  <button className="tool-btn undo-highlight" disabled={!activeHighlights.length} onClick={undoLastHighlight} title="Undo last highlight"><RefreshCw size={14}/> Undo highlight</button>
                </div>
              </div>
              {pdfError ? <div className="reader-error">{pdfError}</div> : !pdf ? <div className="reader-empty"><FileText size={34}/><h2>Open a paper to read</h2><p>Choose a file from Open papers on the left, or return to the Library to add one.</p><button className="button button-primary" onClick={() => setRoute("library")}>Go to library</button></div> :
                <div className="pdf-page-host" ref={canvasHost} onMouseUp={captureSelection} onTouchEnd={captureSelection}/>}
            </section>
            <aside className="reader-side">
              <div className="reader-side-tabs">
                <button className={readerTab === "notes" ? "selected" : ""} onClick={() => setReaderTab("notes")}><NotebookPen size={14}/>Notes</button>
                <button className={readerTab === "highlights" ? "selected" : ""} onClick={() => setReaderTab("highlights")}><Highlighter size={14}/>Highlights</button>
                <button className={readerTab === "ai" ? "selected" : ""} onClick={() => setReaderTab("ai")}><Sparkles size={14}/>AI suggestions</button>
              </div>
              {readerTab === "notes" && <div className="reader-side-scroll">
                <section className="side-card"><div className="card-eyebrow">PAGE {page} · READING NOTE</div><h3>Capture a thought</h3><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Record an explanation, question, connection or critique from this page."/><button className="button button-primary button-full" onClick={saveNote} disabled={!note.trim() || !active}>Save note</button></section>
                <section className="side-card"><div className="card-eyebrow">THIS PAPER</div><h3>Recent thoughts</h3>{activeNotes.length ? [...activeNotes].sort((a,b)=>b.created-a.created).map(item=><article className="note-entry" key={item.id}><span>PAGE {item.page} · {dateLabel(item.created)}</span><p>{item.text}</p></article>) : <p className="helper-copy">Notes for this paper will appear here.</p>}</section>
              </div>}
              {readerTab === "highlights" && <div className="reader-side-scroll">
                <section className="side-card"><div className="card-eyebrow">ANNOTATIONS</div><h3>{activeHighlights.length} saved highlights</h3><p className="helper-copy">Select text in the PDF, then choose Save highlight. Remove individual highlights here or undo the most recent one from the toolbar.</p>
                  {activeHighlights.length ? [...activeHighlights].sort((a,b)=>b.created-a.created).map(item=><article className="highlight-entry" key={item.id}><div><span>PAGE {item.page}</span><p>{item.text}</p></div><button className="quiet-icon" title="Remove this highlight" onClick={() => removeHighlight(item.id)}><Trash2 size={15}/></button></article>) : <p className="helper-copy">No highlights saved for this paper yet.</p>}
                </section>
              </div>}
              {readerTab === "ai" && <div className="reader-side-scroll">
                <section className="side-card ai-assistant-card"><div className="card-eyebrow">DOCUMENT-SPECIFIC ASSISTANT</div><h3>AI suggestions for this paper</h3><p>This space is reserved for analysis of <b>{active?.name || "the selected paper"}</b>: plain-language summary, contributions, methods, limitations, research questions and concept explanations grounded in its text.</p><div className="ai-status"><Sparkles size={17}/><span><b>Local AI is not connected yet</b><small>No text is sent to an external AI service. The local model will run in your browser after setup.</small></span></div><button className="button button-secondary button-full" disabled>Local AI setup — next milestone</button></section>
              </div>}
            </aside>
          </div>
        </div>}

        {view === "notes" && <div className="content"><section className="page-heading"><div><div className="eyebrow">YOUR THINKING, PRESERVED</div><h1>Research notes</h1><p>Notes remain attached to their source papers and page numbers.</p></div><button className="button button-secondary" onClick={exportNotes}><Download size={16}/> Export notes</button></section>
          <div className="notes-list-page">{notes.length ? [...notes].sort((a,b)=>b.created-a.created).map(item=><article className="research-note-card" key={item.id}><div className="note-card-meta"><span>{item.paperName}</span><span>PAGE {item.page} · {dateLabel(item.created)}</span></div><p>{item.text}</p><button className="text-link" onClick={() => {const paper=papers.find(p=>p.id===item.paperId);if(paper)openPaper(paper);}}>Open source paper <ChevronRight size={14}/></button></article>) : <div className="empty-state"><div className="empty-icon"><NotebookPen size={24}/></div><h3>No notes yet</h3><p>Open a paper and save your first reading note.</p><button className="button button-primary" onClick={() => setRoute("library")}>Go to library</button></div>}</div>
        </div>}

        {view === "concepts" && <div className="content"><section className="page-heading"><div><div className="eyebrow">LEARN · CONNECT · REMEMBER</div><h1>Concept desk</h1><p>Your global research glossary, separate from each paper's notes and AI workspace.</p></div><button className="button button-secondary" onClick={() => setGuide(value=>!value)}><HelpCircle size={16}/>{guide ? "Hide guide" : "How to use"}</button></section>
          {guide && <section className="guide-panel"><div className="guide-title"><div className="guide-icon"><HelpCircle size={20}/></div><div><h2>How to use the Concept desk</h2><p>Turn unfamiliar terminology into concepts you can explain and apply.</p></div></div><div className="guide-steps">
            <article><span>01</span><h3>Find a term</h3><p>Search a term from any paper. Use the starter glossary as your entry point.</p></article>
            <article><span>02</span><h3>Build intuition</h3><p>Read the simple meaning and analogy. Try to picture what the idea represents.</p></article>
            <article><span>03</span><h3>Connect it</h3><p>Relate the concept to a method, equation, dataset or research question.</p></article>
            <article><span>04</span><h3>Explain it yourself</h3><p>Write a one- or two-sentence explanation in your own words and connect it to a paper note.</p></article>
          </div><div className="guide-tip"><Sparkles size={17}/><p><b>Research habit:</b> Ask what problem the concept solves, what assumptions it makes, and what evidence would show it is useful.</p></div></section>}
          <div className="concept-layout"><section className="concept-browser"><div className="section-header concept-header"><div><h2>Research glossary</h2><p>{concepts.length} starter concepts</p></div><label className="search-box"><Search size={17}/><input value={termQuery} onChange={e=>setTermQuery(e.target.value)} placeholder="Find a concept"/></label></div><div className="concept-list">
            {matchingConcepts.map(concept => <button className={"concept-row "+(selectedConcept.term===concept.term ? "selected" : "")} key={concept.term} onClick={() => setSelectedConcept(concept)}><span className="concept-row-icon"><Lightbulb size={17}/></span><span><b>{concept.term}</b><small>{concept.area}</small></span><ChevronRight size={16}/></button>)}
            {!matchingConcepts.length && <p className="helper-copy">No matching starter concept. Try a broader keyword.</p>}
          </div></section>
          <article className="concept-detail"><div className="card-eyebrow">{selectedConcept.area}</div><h2>{selectedConcept.term}</h2><div className="concept-block"><h3>In simple words</h3><p>{selectedConcept.definition}</p></div><div className="concept-block"><h3>Build an intuition</h3><p>{selectedConcept.intuition}</p></div><div className="concept-block"><h3>Why it matters</h3><p>{selectedConcept.why}</p></div><div className="concept-example"><span>RESEARCH EXAMPLE</span><p>{selectedConcept.example}</p></div><div className="concept-disclaimer">Curated starter explanations, not AI-generated answers. Paper-specific AI explanations will live in each paper's reading workspace.</div></article></div>
        </div>}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App/>);
