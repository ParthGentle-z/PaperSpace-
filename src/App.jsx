import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, Library, NotebookPen, Lightbulb, Search, Plus, Sun, Moon,
  ChevronRight, ChevronLeft, ChevronUp, ChevronDown, X, ZoomIn, ZoomOut, Maximize2, FileText,
  Trash2, Download, HelpCircle, Sparkles, Menu, PanelLeftClose, PanelLeftOpen,
  FolderOpen, Cloud, Highlighter, MessageSquareText, RefreshCw, ExternalLink,
  Pencil, Save, Copy, Check
} from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
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
const escapeAnnotationHtml = value => String(value || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
function sanitizeAnnotationHtml(html) {
  const parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
  const allowed = new Set(["DIV","P","BR","SPAN","MARK","B","STRONG","I","EM","U"]);
  const walk = node => {
    [...node.childNodes].forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!allowed.has(child.tagName)) {
          child.replaceWith(...child.childNodes);
          return;
        }
        [...child.attributes].forEach(attribute => {
          if (child.tagName === "SPAN" && attribute.name === "style" && /^background-color:\s*(#[0-9a-f]{3,8}|rgb\([\d\s%,.]+\))\s*;?$/i.test(attribute.value)) return;
          child.removeAttribute(attribute.name);
        });
        walk(child);
      } else if (child.nodeType !== Node.TEXT_NODE) child.remove();
    });
  };
  walk(parsed.body);
  return parsed.body.innerHTML;
}
function annotationHtmlToText(html) {
  const parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
  return (parsed.body.innerText || parsed.body.textContent || "").replace(/\u00a0/g," ").trim();
}
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
  const [pdfLoading,setPdfLoading] = useState(false);
  const [page,setPage] = useState(1);
  const [zoom,setZoom] = useState(1);
  const [fit,setFit] = useState(true);
  const [query,setQuery] = useState("");
  const [termQuery,setTermQuery] = useState("");
  const [selectedConcept,setSelectedConcept] = useState(concepts[0]);
  const [note,setNote] = useState("");
  const [noteAnchor,setNoteAnchor] = useState(null);
  const [readMode,setReadMode] = useState(() => localStorage.getItem("ps-read-mode") === "on");
  const [annotationPopup,setAnnotationPopup] = useState(null);
  const [editingAnnotationNoteId,setEditingAnnotationNoteId] = useState(null);
  const [annotationDraft,setAnnotationDraft] = useState("");
  const annotationEditorRef = useRef(null);
  const annotationTextRangeRef = useRef(null);
  const annotationOriginalHtmlRef = useRef(null);
  const [annotationSaveBusy,setAnnotationSaveBusy] = useState(false);
  const [annotationQuoteExpanded,setAnnotationQuoteExpanded] = useState(false);
  const [focusedAnnotationId,setFocusedAnnotationId] = useState("");
  const [annotationSearch,setAnnotationSearch] = useState("");
  const [annotationFilter,setAnnotationFilter] = useState("all");
  const [expandedPaperIds,setExpandedPaperIds] = useState(() => readJson("ps-expanded-note-papers",[]));
  const [selection,setSelection] = useState(null);
  const [contextMenu,setContextMenu] = useState(null);
  const [highlightColor,setHighlightColor] = useState("#ffe36b");
  const [readerTab,setReaderTab] = useState("notes");
  const [sidebarVisible,setSidebarVisible] = useState(() => localStorage.getItem("ps-sidebar") !== "hidden");
  const [topbarVisible,setTopbarVisible] = useState(true);
  const [mobileSidebar,setMobileSidebar] = useState(false);
  const [dark,setDark] = useState(() => localStorage.getItem("ps-theme") !== "light");
  const [guide,setGuide] = useState(true);
  const [toast,setToast] = useState("");
  const [driveBusy,setDriveBusy] = useState(false);
  const [driveMessage,setDriveMessage] = useState("");
  const [driveFolder,setDriveFolder] = useState(() => readJson("ps-drive-folder",null));
  const canvasHost = useRef(null);
  const activeHighlightsRef = useRef([]);
  // Snapshot the drag selection before the browser handles the right-click.
  // Context-menu events can otherwise expose a changed/collapsed DOM range.
  const selectionRef = useRef(null);
  const selectionBoundsRef = useRef(null);
  const openingIdsRef = useRef(new Set());
  const pdfLoadSequenceRef = useRef(0);
  const driveTokenRef = useRef(null);
  const toastTimer = useRef(null);
  const pendingAnnotationRef = useRef(null);
  const highlightClickTimerRef = useRef(null);
  const topbarTimerRef = useRef(null);
  const topbarPointerInsideRef = useRef(false);

  // Stable hover-to-reveal header: entering the top trigger zone cancels
  // the pending hide timer. Leaving it starts one 3-second grace period.
  // Pointer movement inside the zone never restarts the timer.
  useEffect(() => {
    if (view !== "reader") {
      window.clearTimeout(topbarTimerRef.current);
      topbarPointerInsideRef.current = false;
      setTopbarVisible(true);
      return;
    }
    const scheduleHide = () => {
      window.clearTimeout(topbarTimerRef.current);
      topbarTimerRef.current = window.setTimeout(() => {
        if (!topbarPointerInsideRef.current) setTopbarVisible(false);
      }, 3000);
    };
    topbarPointerInsideRef.current = false;
    setTopbarVisible(true);
    scheduleHide();
    const onPointerMove = event => {
      const inside = event.clientY <= 96;
      if (inside) {
        if (!topbarPointerInsideRef.current) {
          topbarPointerInsideRef.current = true;
          window.clearTimeout(topbarTimerRef.current);
        }
        setTopbarVisible(true);
        return;
      }
      if (topbarPointerInsideRef.current) {
        topbarPointerInsideRef.current = false;
        scheduleHide();
      }
    };
    window.addEventListener("pointermove", onPointerMove, {passive:true});
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.clearTimeout(topbarTimerRef.current);
      topbarPointerInsideRef.current = false;
    };
  }, [view]);

  const active = papers.find(p => p.id === activeId) || null;
  activeHighlightsRef.current = active?.highlights || [];
  const notes = useMemo(() => papers.flatMap(p => (p.notes || []).map(n => ({...n,paperName:p.name,paperId:p.id}))),[papers]);
  const hasVisibleAnnotations = papers.some(paper => {
    const q = annotationSearch.trim().toLowerCase();
    const hasNotes = (paper.notes || []).some(item => (annotationFilter === "all" || annotationFilter === "notes" || (annotationFilter === "linked" && item.anchor)) && (paper.name+" "+item.text+" "+(item.anchor?.text || "")).toLowerCase().includes(q));
    const hasHighlights = (paper.highlights || []).some(item => (annotationFilter === "all" || annotationFilter === "highlights") && (paper.name+" "+item.text+" "+(item.category || "")).toLowerCase().includes(q));
    return hasNotes || hasHighlights;
  });
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
  useEffect(() => { localStorage.setItem("ps-read-mode",readMode ? "on" : "off"); },[readMode]);
  useEffect(() => { localStorage.setItem("ps-expanded-note-papers",JSON.stringify(expandedPaperIds)); },[expandedPaperIds]);
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
    if (activeId === paper.id && pdf) { setRoute("reader"); return; }
    if (openingIdsRef.current.has(paper.id)) return;
    openingIdsRef.current.add(paper.id);
    const loadSequence = ++pdfLoadSequenceRef.current;
    addOpenId(paper.id);
    setPdf(null); setPdfError(""); setPdfLoading(true); setPage(1); selectionRef.current = null; selectionBoundsRef.current = null; setSelection(null);
    try {
      const loaded = await pdfjs.getDocument({data:await paper.blob.arrayBuffer()}).promise;
      if (loadSequence === pdfLoadSequenceRef.current) { setPdf(loaded); setPdfLoading(false); }
      else loaded.destroy?.();
    } catch (error) {
      console.error(error);
      if (loadSequence === pdfLoadSequenceRef.current) { setPdfError("This PDF could not be opened. It may be damaged or stored in an unsupported format."); setPdfLoading(false); }
    } finally {
      openingIdsRef.current.delete(paper.id);
    }
  },[addOpenId,activeId,pdf,setRoute]);

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
      pdfLoadSequenceRef.current++;
      openingIdsRef.current.delete(id);
      setActiveId(nextId);
      setPdf(null); setPdfLoading(false); selectionRef.current = null; selectionBoundsRef.current = null; setSelection(null); setPage(1);
      if (!nextId) setRoute("library");
    }
  },[openIds,activeId,setRoute]);

  const removePaper = useCallback(async id => {
    if (!db || !window.confirm("Remove this PDF and its notes/highlights from this browser?")) return;
    await dbDelete(db,id);
    setOpenIds(ids => ids.filter(value => value !== id));
    if (activeId === id) { pdfLoadSequenceRef.current++; openingIdsRef.current.delete(id); setActiveId(""); setPdf(null); setRoute("library"); }
    await refresh();
    notify("Paper removed from this browser.");
  },[db,activeId,refresh,notify,setRoute]);

  const saveNote = useCallback(async () => {
    if (!db || !active || !note.trim()) return;
    const linkedPage = noteAnchor?.page || page;
    const noteItem = {
      id:crypto.randomUUID(),
      page:linkedPage,
      text:note.trim(),
      created:Date.now(),
      type:noteAnchor ? "passage" : "page",
      anchor:noteAnchor ? {text:noteAnchor.text,rects:noteAnchor.rects || [],normalized:!!noteAnchor.normalized,selectionVersion:noteAnchor.selectionVersion || 4,highlightId:noteAnchor.highlightId || null} : null
    };
    const updated = {...active,notes:[...(active.notes || []),noteItem]};
    await dbPut(db,updated); setPapers(items => items.map(item => item.id === updated.id ? updated : item));
    setNote(""); setNoteAnchor(null); notify(noteAnchor ? "Passage-linked note saved." : "Page note saved.");
  },[db,active,note,noteAnchor,page,notify]);

  const saveHighlight = useCallback(async (color=highlightColor, category="General") => {
    if (!db || !active || !selection) return;
    const updated = {...active,highlights:[...(active.highlights || []),{id:crypto.randomUUID(),...selection,color,category,created:Date.now()}]};
    await dbPut(db,updated);
    setPapers(items => items.map(item => item.id === updated.id ? updated : item));
    selectionRef.current = null; selectionBoundsRef.current = null; setSelection(null); setContextMenu(null); window.getSelection()?.removeAllRanges();
    notify("Highlight saved.");
  },[db,active,selection,highlightColor,notify]);

  const removeHighlight = useCallback(async id => {
    if (!db || !active) return;
    const updated = {...active,highlights:(active.highlights || []).filter(item => item.id !== id)};
    await dbPut(db,updated);
    setPapers(items => items.map(item => item.id === updated.id ? updated : item));
    notify("Highlight removed. You can select the passage again later.");
  },[db,active,notify]);

  const beginAnnotationEdit = useCallback((item=null) => {
    // Keep an untouched copy so Cancel can always restore the exact saved note.
    annotationOriginalHtmlRef.current = item?.html
      ? sanitizeAnnotationHtml(item.html)
      : escapeAnnotationHtml(item?.text || "").replace(/\n/g,"<br>");
    annotationTextRangeRef.current = null;
    setEditingAnnotationNoteId(item?.id || "__new__");
    setAnnotationDraft(item?.text || "");
  },[]);

  const rememberAnnotationSelection = useCallback(() => {
    const editor = annotationEditorRef.current;
    const currentSelection = window.getSelection();
    if (!editor || !currentSelection || !currentSelection.rangeCount) return;
    const range = currentSelection.getRangeAt(0);
    if (!range.collapsed && editor.contains(range.commonAncestorContainer)) {
      annotationTextRangeRef.current = range.cloneRange();
    }
  },[]);

  const applyAnnotationHighlight = useCallback(color => {
    const editor = annotationEditorRef.current;
    const savedRange = annotationTextRangeRef.current;
    if (!editor || !savedRange || savedRange.collapsed || !editor.contains(savedRange.commonAncestorContainer)) {
      notify("Select the words you want to highlight first.");
      return;
    }

    // Wrap only the selected text-node fragments. Do not extract/reinsert a
    // mixed HTML range: that can split paragraphs, disturb line breaks, and
    // cause the browser to recalculate inline typography.
    const range = savedRange.cloneRange();
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue?.length) continue;
      try {
        if (range.intersectsNode(node)) textNodes.push(node);
      } catch {
        // Ignore detached or otherwise non-intersecting nodes.
      }
    }

    const wrappedTextNodes = [];
    for (const textNode of textNodes) {
      let start = textNode === range.startContainer ? range.startOffset : 0;
      let end = textNode === range.endContainer ? range.endOffset : textNode.nodeValue.length;

      // When a selection boundary is an element rather than a text node,
      // use the boundary comparison to avoid wrapping text outside the range.
      if (range.startContainer !== textNode && range.comparePoint(textNode, 0) === -1) continue;
      if (range.endContainer !== textNode && range.comparePoint(textNode, textNode.nodeValue.length) === 1) continue;

      start = Math.max(0, Math.min(start, textNode.nodeValue.length));
      end = Math.max(0, Math.min(end, textNode.nodeValue.length));
      if (end <= start) continue;

      let selectedNode = textNode;
      if (end < selectedNode.nodeValue.length) selectedNode.splitText(end);
      if (start > 0) selectedNode = selectedNode.splitText(start);

      const mark = document.createElement("span");
      mark.style.backgroundColor = color;
      mark.setAttribute("data-note-highlight", "true");
      selectedNode.parentNode.insertBefore(mark, selectedNode);
      mark.appendChild(selectedNode);
      wrappedTextNodes.push(selectedNode);
    }

    if (!wrappedTextNodes.length) {
      notify("Select the words you want to highlight first.");
      return;
    }

    // Keep the highlighted text selected so another colour can be chosen
    // immediately, while preserving all original whitespace and <br> nodes.
    const nextRange = document.createRange();
    nextRange.setStart(wrappedTextNodes[0], 0);
    const lastNode = wrappedTextNodes[wrappedTextNodes.length - 1];
    nextRange.setEnd(lastNode, lastNode.nodeValue.length);
    const currentSelection = window.getSelection();
    currentSelection.removeAllRanges();
    currentSelection.addRange(nextRange);
    annotationTextRangeRef.current = nextRange.cloneRange();
  },[notify]);

  const saveAnnotationNote = useCallback(async () => {
    const editorHtml = annotationEditorRef.current?.innerHTML || "";
    const safeHtml = sanitizeAnnotationHtml(editorHtml);
    const plainText = annotationEditorRef.current ? annotationHtmlToText(safeHtml) : annotationDraft.trim();
    if (!db || !active || !annotationPopup || !plainText) return;
    setAnnotationSaveBusy(true);
    try {
      const existingId = editingAnnotationNoteId && editingAnnotationNoteId !== "__new__" ? editingAnnotationNoteId : null;
      const currentNotes = active.notes || [];
      let savedNote;
      let nextNotes;
      if (existingId) {
        nextNotes = currentNotes.map(item => item.id === existingId
          ? {...item,text:plainText,html:safeHtml,updated:Date.now()}
          : item);
        savedNote = nextNotes.find(item => item.id === existingId);
      } else {
        savedNote = {
          id:crypto.randomUUID(),
          page:annotationPopup.highlight.page || page,
          text:plainText,
          html:safeHtml,
          created:Date.now(),
          type:"passage",
          anchor:{
            text:annotationPopup.highlight.text,
            rects:annotationPopup.highlight.rects || [],
            normalized:!!annotationPopup.highlight.normalized,
            selectionVersion:annotationPopup.highlight.selectionVersion || 4,
            highlightId:annotationPopup.highlight.id
          }
        };
        nextNotes = [...currentNotes,savedNote];
      }
      const updated = {...active,notes:nextNotes};
      await dbPut(db,updated);
      setPapers(items => items.map(item => item.id === updated.id ? updated : item));
      const linkedNotes = nextNotes.filter(item => item.anchor && (
        item.anchor.highlightId === annotationPopup.highlight.id ||
        (item.page === annotationPopup.highlight.page && item.anchor.text === annotationPopup.highlight.text)
      ));
      setAnnotationPopup(current => current ? {...current,notes:linkedNotes} : current);
      setEditingAnnotationNoteId(null);
      setAnnotationDraft("");
      if (annotationEditorRef.current) annotationEditorRef.current.innerHTML = "";
      notify(existingId ? "Annotation updated and saved." : "Passage note saved.");
    } catch (error) {
      notify("Could not save this annotation. Please try again.");
    } finally {
      setAnnotationSaveBusy(false);
    }
  },[db,active,annotationPopup,annotationDraft,editingAnnotationNoteId,page,notify]);

  const copyAnnotationText = useCallback(async text => {
    try { await navigator.clipboard.writeText(text || ""); notify("Copied to clipboard."); }
    catch { notify("Clipboard access was unavailable in this browser."); }
    setAnnotationMenuOpen(false);
  },[notify]);

  const cancelAnnotationEdit = useCallback(() => {
    // Discard the editor DOM only. The persisted note object is never touched.
    // Capture the actual scrolling regions so exiting edit mode does not jump
    // to another PDF page or reset the annotation list.
    const pageHost = document.querySelector(".pdf-page-host");
    const noteList = document.querySelector(".annotation-note-list");
    const annotationPanel = document.querySelector(".annotation-read-popover");
    const positions = {
      page: pageHost?.scrollTop ?? 0,
      notes: noteList?.scrollTop ?? 0,
      panel: annotationPanel?.scrollTop ?? 0
    };
    const original = annotationOriginalHtmlRef.current;
    if (annotationEditorRef.current && original !== null) {
      annotationEditorRef.current.innerHTML = original;
    }
    setEditingAnnotationNoteId(null);
    setAnnotationDraft("");
    annotationTextRangeRef.current = null;
    annotationOriginalHtmlRef.current = null;
    window.requestAnimationFrame(() => {
      const nextPageHost = document.querySelector(".pdf-page-host");
      const nextNoteList = document.querySelector(".annotation-note-list");
      const nextPanel = document.querySelector(".annotation-read-popover");
      if (nextPageHost) nextPageHost.scrollTop = positions.page;
      if (nextNoteList) nextNoteList.scrollTop = positions.notes;
      if (nextPanel) nextPanel.scrollTop = positions.panel;
    });
  },[]);

  const closeAnnotationPanel = useCallback(() => {
    if (editingAnnotationNoteId && annotationDraft.trim()) {
      const existing = annotationPopup?.notes?.find(item => item.id === editingAnnotationNoteId);
      const unchanged = existing && existing.text === annotationDraft;
      if (!unchanged && !window.confirm("Discard your unsaved annotation changes?")) return;
    }
    setAnnotationPopup(null);
    setEditingAnnotationNoteId(null);
    setAnnotationDraft("");
    setAnnotationMenuOpen(false);
  },[editingAnnotationNoteId,annotationDraft,annotationPopup]);

  const deleteAnnotationHighlight = useCallback(async () => {
    if (!annotationPopup?.highlight?.id) return;
    const id = annotationPopup.highlight.id;
    setAnnotationMenuOpen(false);
    setEditingAnnotationNoteId(null);
    setAnnotationPopup(null);
    await removeHighlight(id);
  },[annotationPopup,removeHighlight]);

  const undoLastHighlight = useCallback(async () => {
    if (!active?.highlights?.length) return;
    const last = [...active.highlights].sort((a,b) => b.created-a.created)[0];    await removeHighlight(last.id);
  },[active,removeHighlight]);

  const captureSelection = useCallback(() => {
    const nativeSelection = window.getSelection();
    if (!nativeSelection || nativeSelection.isCollapsed || !nativeSelection.rangeCount || !canvasHost.current) return null;

    // A PDF.js TextLayer is already the browser's selectable text representation.
    // Never infer text by measuring individual glyphs: that loses characters in
    // proportional fonts, ligatures, superscripts and multi-span selections.
    const range = nativeSelection.getRangeAt(0);
    const elementFor = node => node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const startElement = elementFor(range.startContainer);
    const endElement = elementFor(range.endContainer);
    const sheet = startElement?.closest(".pdf-sheet");
    if (!sheet || endElement?.closest(".pdf-sheet") !== sheet) return null;

    const layer = sheet.querySelector(".pdf-text-layer");
    if (!layer || !layer.contains(range.startContainer) || !layer.contains(range.endContainer)) return null;

    // Build the quote from the exact selected text-node fragments. PDF.js places
    // separate spans at absolute coordinates; Range.toString() concatenates those
    // fragments without consistently restoring the visual spaces between spans.
    const pageBounds = sheet.getBoundingClientRect();
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    const fragments = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue?.length) continue;
      const nodeRange = document.createRange();
      nodeRange.selectNodeContents(node);
      if (!range.intersectsNode(node)) continue;
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
      if (end <= start) continue;
      nodeRange.setStart(node,start);
      nodeRange.setEnd(node,end);
      const value = node.nodeValue.slice(start,end);
      const rect = Array.from(nodeRange.getClientRects()).find(item => item.width > .5 && item.height > .5);
      if (value && rect) fragments.push({value,rect,fontSize:parseFloat(getComputedStyle(node.parentElement).fontSize)||12});
    }
    if (!fragments.length) return null;
    const joinFragments = [];
    for (const fragment of fragments) {
      const previous = joinFragments[joinFragments.length-1];
      if (previous) {
        const verticalGap = fragment.rect.top - previous.rect.top;
        const lineHeight = Math.max(previous.rect.height,fragment.rect.height);
        const horizontalGap = fragment.rect.left - previous.rect.right;
        const explicitSpace = /\\s$/.test(previous.value) || /^\\s/.test(fragment.value);
        if (verticalGap > lineHeight * .75) {
          joinFragments.push({value:verticalGap > lineHeight * 1.45 ? "\\n\\n" : "\\n"});
        } else if (!explicitSpace && horizontalGap > Math.max(1.25,Math.min(previous.fontSize,fragment.fontSize)*.16)) {
          joinFragments.push({value:" "});
        }
      }
      joinFragments.push(fragment);
    }
    const text = joinFragments.map(item=>item.value).join("").replace(/[ \\t]+\\n/g,"\\n").replace(/\\n[ \\t]+/g,"\\n").trim();
    if (!text) return null;


    if (pageBounds.width <= 0 || pageBounds.height <= 0) return null;
    const rawRects = Array.from(range.getClientRects()).filter(rect =>
      rect.width > 0.5 && rect.height > 0.5 &&
      rect.right > pageBounds.left && rect.left < pageBounds.right &&
      rect.bottom > pageBounds.top && rect.top < pageBounds.bottom
    );
    if (!rawRects.length) return null;

    // Merge adjacent fragments on the same visual line only. Coordinates are
    // relative to the PDF page shell, so zoom/retina scaling is handled naturally.
    const ordered = rawRects.map(rect => ({
      left: Math.max(rect.left, pageBounds.left),
      right: Math.min(rect.right, pageBounds.right),
      top: Math.max(rect.top, pageBounds.top),
      bottom: Math.min(rect.bottom, pageBounds.bottom)
    })).sort((a,b) => a.top-b.top || a.left-b.left);

    const lines = [];
    for (const rect of ordered) {
      const line = lines.find(item => {
        const overlap = Math.max(0, Math.min(item.bottom, rect.bottom) - Math.max(item.top, rect.top));
        return overlap >= Math.min(item.bottom-item.top, rect.bottom-rect.top) * 0.55;
      });
      if (line) {
        line.rects.push(rect);        line.top = Math.min(line.top,rect.top);
        line.bottom = Math.max(line.bottom,rect.bottom);
      } else {
        lines.push({top:rect.top,bottom:rect.bottom,rects:[rect]});
      }
    }

    const normalizedRects = [];
    for (const line of lines) {
      line.rects.sort((a,b)=>a.left-b.left);
      let merged = null;
      for (const rect of line.rects) {
        if (merged && rect.left-merged.right <= 3) {
          merged.right = Math.max(merged.right,rect.right);
          merged.top = Math.min(merged.top,rect.top);
          merged.bottom = Math.max(merged.bottom,rect.bottom);
        } else {
          if (merged) normalizedRects.push({
            x:(merged.left-pageBounds.left)/pageBounds.width,
            y:(merged.top-pageBounds.top)/pageBounds.height,
            w:(merged.right-merged.left)/pageBounds.width,
            h:(merged.bottom-merged.top)/pageBounds.height
          });
          merged = {...rect};
        }
      }
      if (merged) normalizedRects.push({
        x:(merged.left-pageBounds.left)/pageBounds.width,
        y:(merged.top-pageBounds.top)/pageBounds.height,
        w:(merged.right-merged.left)/pageBounds.width,
        h:(merged.bottom-merged.top)/pageBounds.height
      });
    }

    const captured = {
      text,
      page:Number(sheet.dataset.page),
      rects:normalizedRects,
      normalized:true,
      selectionVersion:4
    };
    selectionRef.current = captured;
    const bounds = rawRects.reduce((box,rect)=>({
      left:Math.min(box.left,rect.left), top:Math.min(box.top,rect.top),
      right:Math.max(box.right,rect.right), bottom:Math.max(box.bottom,rect.bottom)
    }),{left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity});
    selectionBoundsRef.current = bounds;
    setSelection(captured);
    return captured;
  },[]);
  const handlePdfContextMenu = useCallback(event => {
    // Do not read window.getSelection() again here: right-click may change the
    // browser range after the user has released the left mouse button.
    const captured = selectionRef.current;
    if (!captured?.text) return;
    event.preventDefault();

    // Use the anchor measured at mouse-up, so the menu and quoted text refer to
    // the exact same selection snapshot.
    const bounds = selectionBoundsRef.current;
    const menuWidth = 284, menuHeight = 330, gutter = 10;
    const x = bounds
      ? Math.max(8, Math.min(bounds.left, window.innerWidth-menuWidth-8))
      : Math.max(8, Math.min(event.clientX,window.innerWidth-menuWidth-8));
    let y = bounds ? bounds.bottom + gutter : event.clientY + gutter;
    if (y + menuHeight > window.innerHeight - 8) {
      y = bounds ? bounds.top - menuHeight - gutter : event.clientY - menuHeight - gutter;
    }
    y = Math.max(8,Math.min(y,window.innerHeight-menuHeight-8));
    setContextMenu({x,y,text:captured.text});
  },[]);

  const addSelectionAsNote = useCallback(() => {
    if (!selection?.text) return;
    // Stage the exact selected passage as the note's anchor. The reader's note
    // body remains the user's own interpretation, not a duplicated quotation.
    setNoteAnchor({...selection});
    setNote("");
    setReaderTab("notes");
    setContextMenu(null);
    selectionRef.current = null; selectionBoundsRef.current = null; setSelection(null);
    window.getSelection()?.removeAllRanges();
    notify("Passage attached. Add your thought and save the note.");
  },[selection,notify]);

  const copySelection = useCallback(async () => {
    if (!selection?.text) return;
    try { await navigator.clipboard.writeText(selection.text); notify("Selected passage copied."); }
    catch { notify("Clipboard access is unavailable in this browser."); }
    setContextMenu(null);
  },[selection,notify]);

  const scrollToPage = useCallback(target => {
    const pageElement = canvasHost.current?.querySelector('[data-page="'+target+'"]');
    if (pageElement) pageElement.scrollIntoView({behavior:"smooth",block:"start"});
    setPage(target);
  },[]);

  const openAnnotation = useCallback((paperId, annotation, kind="highlight") => {
    if (!paperId || !annotation) return;
    pendingAnnotationRef.current = {
      paperId, page:annotation.page || annotation.anchor?.page || 1,
      text:kind === "note" ? (annotation.anchor?.text || "") : (annotation.text || ""),
      rects:annotation.rects || annotation.anchor?.rects || [],
      normalized:annotation.normalized ?? annotation.anchor?.normalized ?? true,
      id:kind === "highlight" ? annotation.id : (annotation.anchor?.highlightId || null)
    };
    setFocusedAnnotationId(kind === "highlight" ? annotation.id : (annotation.anchor?.highlightId || annotation.id));
    setAnnotationPopup(null);
    setRoute("reader");
    const paper = papers.find(item => item.id === paperId);
    if (paper && (activeId !== paperId || !pdf)) openPaper(paper);
    else if (annotation.page) setPage(annotation.page);
  },[papers,activeId,pdf,openPaper,setRoute]);

  const handleSavedHighlightClick = useCallback(event => {
    if (!readMode) return;
    const mark = event.target.closest?.(".saved-highlight");
    if (!mark) { setAnnotationPopup(null); return; }
    const highlight = activeHighlightsRef.current.find(item => item.id === mark.dataset.annotationId);
    if (!highlight) return;
    event.preventDefault(); event.stopPropagation();
    if (highlightClickTimerRef.current) window.clearTimeout(highlightClickTimerRef.current);
    highlightClickTimerRef.current = window.setTimeout(() => {
      const linkedNotes = (active?.notes || []).filter(item => item.anchor &&
        (item.anchor.highlightId === highlight.id || (item.page === highlight.page && item.anchor.text === highlight.text)));
      // Render the annotation in a dedicated right-hand reading column.
      // Keeping it out of the PDF canvas prevents it from covering the passage.
      setAnnotationQuoteExpanded(false);
      setAnnotationPopup({highlight,notes:linkedNotes});
    },240);
  },[readMode,active]);

  const handleSavedHighlightDoubleClick = useCallback(event => {
    if (!readMode) return;
    const mark = event.target.closest?.(".saved-highlight");
    if (!mark) return;
    const highlight = activeHighlightsRef.current.find(item => item.id === mark.dataset.annotationId);
    if (!highlight) return;
    event.preventDefault(); event.stopPropagation();
    if (highlightClickTimerRef.current) window.clearTimeout(highlightClickTimerRef.current);
    setAnnotationPopup(null);
    setFocusedAnnotationId(highlight.id);
    setAnnotationFilter("all");
    setAnnotationSearch("");
    setExpandedPaperIds(ids => active && !ids.includes(active.id) ? [...ids,active.id] : ids);
    setRoute("notes");
  },[readMode,setRoute]);

  useEffect(() => {
    if (view !== "reader" || !pdf || !pendingAnnotationRef.current || !canvasHost.current) return;
    const target = pendingAnnotationRef.current;
    if (target.paperId !== activeId) return;
    let cancelled = false, attempts = 0, timer = 0;
    const locate = () => {
      if (cancelled) return false;
      const root = canvasHost.current;
      const sheet = root?.querySelector('[data-page="'+target.page+'"]');
      const layer = sheet?.querySelector(".pdf-text-layer");
      if (!root || !sheet || !layer || !layer.childElementCount) return false;
      const rootBounds = root.getBoundingClientRect();
      const sheetBounds = sheet.getBoundingClientRect();
      const rect = target.rects?.[0];
      const localY = rect ? (target.normalized ? rect.y*sheet.clientHeight : rect.y) : 0;
      const absoluteY = root.scrollTop + sheetBounds.top-rootBounds.top + localY;
      root.scrollTo({top:Math.max(0,absoluteY-Math.min(150,root.clientHeight*.28)),behavior:"smooth"});
      setPage(target.page);
      const mark = target.id ? Array.from(sheet.querySelectorAll(".saved-highlight")).find(node=>node.dataset.annotationId===target.id) : null;
      if (mark) {
        mark.classList.add("annotation-focus-pulse");
        window.setTimeout(()=>mark.classList.remove("annotation-focus-pulse"),2200);
      } else {
        layer.querySelectorAll(".source-jump-target").forEach(node=>node.remove());
        const focusRects=[];
        if (target.rects?.length) {
          target.rects.forEach(rect=>{
            const x=target.normalized?rect.x*layer.clientWidth:rect.x;
            const y=target.normalized?rect.y*layer.clientHeight:rect.y;
            const w=target.normalized?rect.w*layer.clientWidth:rect.w;
            const h=target.normalized?rect.h*layer.clientHeight:rect.h;
            focusRects.push({left:x,top:y,width:w,height:h});
          });
        } else if (target.text) {
          // Legacy notes sometimes contain the exact passage but no saved
          // rectangles. Find it across PDF.js text spans and create a DOM Range.
          const walker=document.createTreeWalker(layer,NodeFilter.SHOW_TEXT);
          const nodes=[]; let raw="", node;
          while((node=walker.nextNode())) { nodes.push({node,start:raw.length,end:raw.length+node.nodeValue.length}); raw+=node.nodeValue; }
          const normalizeWithMap=value=>{
            let out="", map=[], whitespace=false;
            for(let i=0;i<value.length;i++){
              const ch=value[i];
              if(/\s/.test(ch)){ if(!whitespace && out.length){out+=" ";map.push(i);} whitespace=true; }
              else {out+=ch;map.push(i);whitespace=false;}
            }
            return {text:out.trim(),map};
          };
          const hay=normalizeWithMap(raw), needle=normalizeWithMap(target.text).text;
          const at=needle ? hay.text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
          if(at>=0){
            const rawStart=hay.map[at], rawEnd=hay.map[at+needle.length-1]+1;
            const first=nodes.find(entry=>rawStart>=entry.start&&rawStart<entry.end);
            const last=[...nodes].reverse().find(entry=>rawEnd>entry.start&&rawEnd<=entry.end);
            if(first&&last){
              const range=document.createRange();
              range.setStart(first.node,rawStart-first.start);
              range.setEnd(last.node,rawEnd-last.start);
              Array.from(range.getClientRects()).forEach(rect=>{
                const bounds=layer.getBoundingClientRect();
                focusRects.push({left:rect.left-bounds.left,top:rect.top-bounds.top,width:rect.width,height:rect.height});
              });
            }
          }
        }
        focusRects.forEach(rect=>{
          const focus=document.createElement("div");
          focus.className="source-jump-target";
          Object.assign(focus.style,{left:rect.left+"px",top:rect.top+"px",width:rect.width+"px",height:rect.height+"px"});
          layer.appendChild(focus);
        });
        if(focusRects.length) window.setTimeout(()=>layer.querySelectorAll(".source-jump-target").forEach(node=>node.remove()),2600);
      }
      pendingAnnotationRef.current=null;
      setFocusedAnnotationId(target.id || "");
      return true;
    };
    const frame=()=>{
      if(cancelled)return;
      if(!locate() && attempts++<90) timer=window.setTimeout(frame,100);
      else if(attempts>=90) pendingAnnotationRef.current=null;
    };
    frame();
    return ()=>{cancelled=true;window.clearTimeout(timer);};
  },[view,pdf,activeId]);

  useEffect(() => {
    if (view !== "notes" || !focusedAnnotationId) return;
    const frame = requestAnimationFrame(() => document.getElementById("annotation-"+focusedAnnotationId)?.scrollIntoView({behavior:"smooth",block:"center"}));
    return () => cancelAnimationFrame(frame);
  },[view,focusedAnnotationId]);

  // Render PDF pages on demand. Creating every full-resolution canvas at once can
  // exhaust browser memory and is the main cause of intermittent blank readers.
  // Page shells remain in the scroll flow; only visible/near-visible pages get canvases.
  useEffect(() => () => { try { pdf?.destroy?.(); } catch {} },[pdf]);

  useEffect(() => {
    // The reader canvas is conditionally mounted. Rebuild its page shells whenever
    // the user returns from Library, Notes, or Concept Desk; keep the PDF document
    // alive while those other workspace views are active.
    if (view !== "reader" || !pdf || !canvasHost.current) return;
    let cancelled = false;
    let resizeTimer = 0;
    let generation = 0;
    const root = canvasHost.current;
    const renderTasks = new Map();
    const rendered = new Set();
    let intersectionObserver;

    const cancelTasks = () => {
      for (const task of renderTasks.values()) {
        try { task.cancel(); } catch {}
      }
      renderTasks.clear();
    };

    const paintHighlights = (entry, viewport) => {
      for (const highlight of (activeHighlightsRef.current || []).filter(item => item.page === entry.number)) {
        for (const rect of highlight.rects || []) {
          const mark = document.createElement("div");
          mark.className = "saved-highlight";
          mark.dataset.annotationId = highlight.id;
          mark.dataset.page = String(highlight.page);
          mark.setAttribute("role","button");
          mark.setAttribute("aria-label","Saved highlight: "+(highlight.text || "").slice(0,100));
          mark.tabIndex = readMode ? 0 : -1;
          mark.style.background = highlight.color || "#ffe36b";
          const x = highlight.normalized ? rect.x * viewport.width : rect.x;
          const y = highlight.normalized ? rect.y * viewport.height : rect.y;
          const w = highlight.normalized ? rect.w * viewport.width : rect.w;
          const h = highlight.normalized ? rect.h * viewport.height : rect.h;
          Object.assign(mark.style,{left:x+"px",top:y+"px",width:w+"px",height:h+"px"});
          entry.layer.appendChild(mark);
        }
      }
    };

    const renderEntry = async (entry, currentGeneration) => {
      if (cancelled || currentGeneration !== generation || rendered.has(entry.number)) return;
      const entryToken = (entry.token || 0) + 1;
      entry.token = entryToken;
      rendered.add(entry.number);
      try {
        const pdfPage = await pdf.getPage(entry.number);
        if (cancelled || currentGeneration !== generation || entry.token !== entryToken) return;
        const availableWidth = Math.max(240, root.clientWidth - 32);
        const baseViewport = pdfPage.getViewport({scale:1});
        const scale = fit ? Math.min(2.5, availableWidth / baseViewport.width) : zoom;
        const viewport = pdfPage.getViewport({scale});
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", {alpha:false});
        if (!context) throw new Error("Canvas rendering is unavailable in this browser.");
        canvas.width = Math.ceil(viewport.width * ratio);
        canvas.height = Math.ceil(viewport.height * ratio);
        canvas.style.width = viewport.width + "px";
        canvas.style.height = viewport.height + "px";
        entry.shell.style.width = viewport.width + "px";
        entry.shell.style.height = viewport.height + "px";
        entry.layer.style.width = viewport.width + "px";
        entry.layer.style.height = viewport.height + "px";
        // PDF.js TextLayer uses the viewport scale for text-span geometry.
        // Set both variables explicitly before render so browser hit-testing,
        // native selection and the visible canvas share the same coordinate system.
        entry.layer.style.setProperty("--scale-factor",String(viewport.scale));
        entry.layer.style.setProperty("--total-scale-factor",String(viewport.scale));
        entry.shell.replaceChildren(canvas,entry.layer);
        const task = pdfPage.render({
          canvasContext:context,viewport,
          transform:ratio === 1 ? null : [ratio,0,0,ratio,0,0],
          background:"#ffffff"
        });
        renderTasks.set(entry.number,task);
        await task.promise;
        renderTasks.delete(entry.number);
        if (cancelled || currentGeneration !== generation || entry.token !== entryToken) return;

        const textContent = await pdfPage.getTextContent();
        if (cancelled || currentGeneration !== generation || entry.token !== entryToken) return;
        entry.layer.className = "pdf-text-layer textLayer";
        const textLayer = new pdfjs.TextLayer({
          textContentSource:textContent,
          container:entry.layer,
          viewport
        });
        renderTasks.set(entry.number,{cancel:()=>textLayer.cancel?.()});
        await textLayer.render();
        renderTasks.delete(entry.number);
        if (cancelled || currentGeneration !== generation || entry.token !== entryToken) return;
        paintHighlights(entry,viewport);
        entry.shell.classList.remove("pdf-sheet-loading","pdf-sheet-error");
        pdfPage.cleanup?.();
      } catch (error) {
        renderTasks.delete(entry.number);
        if (error?.name === "RenderingCancelledException" || cancelled || currentGeneration !== generation || entry.token !== entryToken) return;
        rendered.delete(entry.number);
        console.error("PDF page render error",entry.number,error);
        entry.shell.classList.add("pdf-sheet-error");
        entry.shell.replaceChildren();
        const message = document.createElement("p");
        message.className = "pdf-page-error-message";        message.textContent = "Page " + entry.number + " could not be rendered. Scroll away and back to retry, or reopen the paper.";
        entry.shell.appendChild(message);
      }
    };

    const buildDocument = async () => {
      generation++;
      const currentGeneration = generation;
      cancelTasks();
      rendered.clear();
      if (intersectionObserver) intersectionObserver.disconnect();
      const oldScrollTop = root.scrollTop;
      root.replaceChildren();
      const firstPage = await pdf.getPage(1);
      if (cancelled || currentGeneration !== generation) return;
      const firstViewport = firstPage.getViewport({scale:1});
      const availableWidth = Math.max(240,root.clientWidth - 32);
      const placeholderScale = fit ? Math.min(2.5,availableWidth/firstViewport.width) : zoom;
      const placeholderWidth = firstViewport.width*placeholderScale;
      const placeholderHeight = firstViewport.height*placeholderScale;
      const entries = [];
      for (let number=1; number<=pdf.numPages; number++) {
        const shell=document.createElement("article");
        shell.className="pdf-sheet pdf-sheet-loading";
        shell.dataset.page=String(number);
        const layer=document.createElement("div");
        layer.className="pdf-text-layer textLayer";
        shell.style.width=placeholderWidth+"px";
        shell.style.height=placeholderHeight+"px";
        const placeholder=document.createElement("div");
        placeholder.className="pdf-page-placeholder";
        placeholder.textContent="Loading page "+number+"…";
        shell.append(placeholder,layer);
        root.appendChild(shell);
        entries.push({number,shell,layer});
      }
      intersectionObserver = new IntersectionObserver(observations => {
        for (const observation of observations) {
          const entry=entries[Number(observation.target.dataset.page)-1];
          if (!entry) continue;
          if (observation.isIntersecting) {
            renderEntry(entry,currentGeneration);
          } else if (rendered.has(entry.number)) {
            entry.token=(entry.token || 0)+1;
            try { renderTasks.get(entry.number)?.cancel?.(); } catch {}
            renderTasks.delete(entry.number);
            rendered.delete(entry.number);
            const canvas=entry.shell.querySelector("canvas");
            if (canvas) { canvas.width=0; canvas.height=0; }
            const placeholder=document.createElement("div");
            placeholder.className="pdf-page-placeholder";
            placeholder.textContent="Scroll to load page "+entry.number;
            entry.layer.replaceChildren();
            entry.shell.replaceChildren(placeholder,entry.layer);
          }
        }
      },{root,rootMargin:"1000px 0px",threshold:0});
      entries.forEach(entry=>intersectionObserver.observe(entry.shell));
      requestAnimationFrame(()=>{ if (!cancelled && currentGeneration===generation) root.scrollTop=oldScrollTop; });
    };

    const resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer=window.setTimeout(buildDocument,220);
    });
    resizeObserver.observe(root);
    buildDocument();

    const onScroll=()=>{
      if (root.scrollTop > 4) { setTopbarVisible(false); window.clearTimeout(topbarTimerRef.current); }
      const sheets=Array.from(root.querySelectorAll(".pdf-sheet"));
      if (!sheets.length) return;
      const line=root.getBoundingClientRect().top+36;
      let nearest=sheets[0],distance=Infinity;
      for (const sheet of sheets) {
        const d=Math.abs(sheet.getBoundingClientRect().top-line);
        if (d<distance) {nearest=sheet;distance=d;}
      }
      setPage(Number(nearest.dataset.page));
    };
    root.addEventListener("scroll",onScroll,{passive:true});
    return ()=>{
      cancelled=true;
      generation++;
      window.clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();
      cancelTasks();
      root.removeEventListener("scroll",onScroll);
    };
  },[view,pdf,zoom,fit,activeId,readMode]);

  // Annotation updates must never rebuild the PDF page tree. Repaint only the
  // lightweight overlay rectangles, leaving canvases, text layers and scroll
  // position untouched. This is intentionally independent of PDF rendering.
  useEffect(() => {
    if (view !== "reader" || !pdf || !canvasHost.current) return;
    const root = canvasHost.current;
    const pages = root.querySelectorAll(".pdf-sheet");
    pages.forEach(sheet => {
      const layer = sheet.querySelector(".pdf-text-layer");
      if (!layer) return;
      layer.querySelectorAll(":scope > .saved-highlight").forEach(node => node.remove());
      const pageNumber = Number(sheet.dataset.page);
      const pageHighlights = (activeHighlightsRef.current || []).filter(item => item.page === pageNumber);
      const width = layer.clientWidth || sheet.clientWidth;
      const height = layer.clientHeight || sheet.clientHeight;
      if (!width || !height) return;
      pageHighlights.forEach(highlight => (highlight.rects || []).forEach(rect => {
        const mark = document.createElement("div");
        mark.className = "saved-highlight";
        mark.dataset.annotationId = highlight.id;
        mark.dataset.page = String(highlight.page);
        mark.setAttribute("role","button");
        mark.setAttribute("aria-label","Saved highlight: "+(highlight.text || "").slice(0,100));
        mark.style.background = highlight.color || "#ffe36b";
        const x = highlight.normalized ? rect.x * width : rect.x;
        const y = highlight.normalized ? rect.y * height : rect.y;
        const w = highlight.normalized ? rect.w * width : rect.w;
        const h = highlight.normalized ? rect.h * height : rect.h;
        Object.assign(mark.style,{left:x+"px",top:y+"px",width:w+"px",height:h+"px"});
        layer.appendChild(mark);
      }));
    });
  },[view,pdf,active?.highlights]);

  const addLocalFiles = useCallback(async files => {
    if (!db) return;
    for (const file of Array.from(files)) {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) continue;
      await dbPut(db,{id:crypto.randomUUID(),name:file.name,blob:file,added:Date.now(),notes:[],highlights:[],provider:"local"});
    }
    await refresh(); notify("PDFs added to your private library.");
  },[db,refresh,notify]);

  const exportNotes = useCallback(() => {    const payload = JSON.stringify({exportedAt:new Date().toISOString(),papers:papers.map(({blob,...item})=>item)},null,2);
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
    <div className={"app-shell "+(view === "reader" ? "reader-mode " : "")+(readMode && view === "reader" ? "read-mode-active " : "")+(sidebarVisible ? "" : "sidebar-hidden")+(topbarVisible ? "" : " reader-topbar-collapsed")+(editingAnnotationNoteId !== null && annotationPopup && readMode ? " annotation-focus-mode" : "")}>
      {sidebarVisible && <aside className={"sidebar "+(mobileSidebar ? "mobile-open" : "")}>
        <div className="brand"><span className="brand-mark">P</span><span className="brand-name">PaperSpace</span><span className="brand-beta">RESEARCH DESK</span></div>
        <div className="sidebar-actions-row">
          <button className="sidebar-add-paper" onClick={() => document.getElementById("paper-upload")?.click()}><Plus size={15}/> Add paper</button>
          <button className="icon-btn sidebar-theme-toggle" onClick={() => setDark(v=>!v)} title={dark ? "Switch to light mode" : "Switch to dark mode"} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</button>
        </div>
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
        <header className={"topbar "+(!topbarVisible && view === "reader" ? "topbar-auto-hidden" : "")}>
          <div className="topbar-left">
            <button className="icon-btn sidebar-toggle" title={sidebarVisible ? "Hide menu and compact header" : "Show menu"}
              onClick={() => { if (window.matchMedia("(max-width: 820px)").matches) { if (!sidebarVisible) { setSidebarVisible(true); setMobileSidebar(true); } else setMobileSidebar(v=>!v); } else { const next=!sidebarVisible; setSidebarVisible(next); setTopbarVisible(next); } }}>
              {sidebarVisible ? <PanelLeftClose size={17}/> : <Menu size={17}/>}
            </button>
            <div className="breadcrumb"><span>WORKSPACE</span><b>/</b><strong>{view === "reader" ? "Reading" : view === "library" ? "Library" : view === "notes" ? "Research notes" : "Concept desk"}</strong></div>
            {view === "reader" && <div className="reader-topbar-meta"><span className="eyebrow">READING WORKSPACE</span><span className="reader-document-title" title={active?.name || "No paper selected"}>{active?.name || "Choose an open paper"}</span></div>}
          </div>
          <div className="top-actions">
            {view === "reader" && <><span className="reader-page-status">{pdf ? "Page "+page+" of "+pdf.numPages : "Select an open paper to begin"}</span><button className="reader-open-paper" title="Open paper library" aria-label="Open paper library" onClick={() => setRoute("library")}><FolderOpen size={17}/></button></>}
            {view !== "reader" && <button className="button button-primary" onClick={() => document.getElementById("paper-upload")?.click()}><Plus size={16}/><span>Add paper</span></button>}
            {view === "reader" && <button className="topbar-collapse" title="Hide top bar" aria-label="Hide top bar" onClick={() => setTopbarVisible(false)}><ChevronUp size={18}/></button>}
          </div>
        </header>
        <input id="paper-upload" hidden type="file" accept="application/pdf,.pdf" multiple onChange={e => { addLocalFiles(e.target.files); e.target.value=""; }}/>

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
            {filtered.map(paper => <article
              className="paper-card"
              key={paper.id}
              role="button"
              tabIndex={0}
              aria-label={"Open "+paper.name}
              onClick={() => openPaper(paper)}
              onKeyDown={event => {                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openPaper(paper);
                }
              }}
            >
              <div className="paper-card-top">
                <span className="pdf-icon"><FileText size={21}/></span>
                <button
                  className="quiet-icon paper-card-delete"
                  onClick={event => { event.stopPropagation(); removePaper(paper.id); }}
                  title={"Delete "+paper.name}
                  aria-label={"Delete "+paper.name}
                ><Trash2 size={16}/></button>
              </div>
              <h3>{paper.name}</h3>
              <p className="paper-meta">{paper.provider === "google-drive" ? "Google Drive import" : "Added "+dateLabel(paper.added)}</p>
              <div className="paper-card-bottom">
                <span>{(paper.notes || []).length} notes · {(paper.highlights || []).length} highlights</span>
                <span className="paper-card-open-label">Open paper <ChevronRight size={15}/></span>
              </div>
            </article>)}
            {!filtered.length && <div className="empty-state"><div className="empty-icon"><Library size={24}/></div><h3>{papers.length ? "No matching papers" : "Your research library starts here"}</h3><p>{papers.length ? "Try another title search." : "Add a PDF to start reading, annotating and collecting research ideas."}</p><button className="button button-primary" onClick={() => document.getElementById("paper-upload")?.click()}><Plus size={16}/> Add your first paper</button></div>}
          </div>
          <div className="drive-setup-note"><HelpCircle size={15}/><span>Google Drive requires a Google Cloud project with the Picker and Drive APIs enabled, an API key, a Web OAuth client ID and the project number. Configure these as GitHub Actions variables to enable the connection.</span></div>
        </div>}

        {view === "reader" && <div className="reader-content">
          <div className={"reader-layout "+(annotationPopup && readMode ? "annotation-open " : "")+(editingAnnotationNoteId !== null && annotationPopup && readMode ? "annotation-edit-focus" : "")}>
            <section className="pdf-panel">
              <div className="pdf-toolbar">
                <div className="toolbar-page">
                  <button className="icon-btn" disabled={!pdf || page <= 1} onClick={() => scrollToPage(Math.max(1,page-1))}><ChevronLeft size={17}/></button>
                  <span>{pdf ? page+" / "+pdf.numPages : "— / —"}</span>
                  <button className="icon-btn" disabled={!pdf || page >= pdf.numPages} onClick={() => scrollToPage(Math.min(pdf?.numPages || page,page+1))}><ChevronRight size={17}/></button>
                </div>
                <div className="toolbar-tools">
                  <button className={"tool-btn read-mode-toggle "+(readMode ? "selected" : "")} aria-pressed={readMode} onClick={() => {setReadMode(value=>!value);setAnnotationPopup(null);}} title="Toggle interactive annotation reading"><BookOpen size={14}/> {readMode ? "Read mode on" : "Read mode"}</button>
                  <button className={"tool-btn "+(fit ? "selected" : "")} onClick={() => setFit(true)}><Maximize2 size={14}/> Fit width</button>
                  <button className="icon-btn" disabled={!pdf} onClick={() => {setFit(false);setZoom(value=>Math.max(.55,value-.15));}} title="Zoom out"><ZoomOut size={16}/></button>
                  <span className="zoom-value">{fit ? "Fit" : Math.round(zoom*100)+"%"}</span>
                  <button className="icon-btn" disabled={!pdf} onClick={() => {setFit(false);setZoom(value=>Math.min(2.5,value+.15));}} title="Zoom in"><ZoomIn size={16}/></button>
                  <button className="tool-btn undo-highlight" disabled={!activeHighlights.length} onClick={undoLastHighlight} title="Remove only the most recently saved highlight"><RefreshCw size={14}/> Undo last</button>
                </div>
              </div>
              {pdfError ? <div className="reader-error">{pdfError}</div> : !pdf ? <div className="reader-empty"><FileText size={34}/><h2>{pdfLoading ? "Loading your paper…" : "Open a paper to read"}</h2><p>{pdfLoading ? "Preparing the PDF pages. Large documents may take a moment." : "Choose a file from Open papers on the left, or return to the Library to add one."}</p>{!pdfLoading && <button className="button button-primary" onClick={() => setRoute("library")}>Go to library</button>}</div> :
                <div className="pdf-page-host" ref={canvasHost} onClick={handleSavedHighlightClick} onDoubleClick={handleSavedHighlightDoubleClick} onMouseUp={event => {
                  if (event.button !== 0) return;
                  setContextMenu(null);
                  // Chromium can dispatch mouseup before its final selection range
                  // is committed for transformed PDF.js text spans. Read after paint.
                  requestAnimationFrame(() => requestAnimationFrame(() => {
                    const captured = captureSelection();
                    if (!captured) { selectionRef.current = null; selectionBoundsRef.current = null; setSelection(null); }
                  }));
                }} onTouchEnd={() => requestAnimationFrame(captureSelection)} onContextMenu={handlePdfContextMenu}/>
              }
              
              {contextMenu && <div className="selection-context-menu" role="menu" style={{left:contextMenu.x,top:contextMenu.y}} onMouseDown={event=>event.preventDefault()}>
                <div className="selection-menu-label">SELECTED PASSAGE</div>
                <p className="selection-menu-quote">{contextMenu.text}</p>
                <div className="smart-highlight-label">SMART HIGHLIGHT · CLASSIFY THIS PASSAGE</div>
                <div className="smart-highlight-types">
                  {[
                    ["Key idea","#FFE58F"],["Definition","#BFE8C8"],["Method","#B9DDF5"],["Result","#F4C2D7"],["Question","#D8C8F3"]
                  ].map(([category,color])=><button key={category} className="smart-highlight-type" onClick={()=>saveHighlight(color,category)}><span style={{background:color}}/>{category}</button>)}
                </div>
                <div className="selection-menu-colors" aria-label="Highlight selected passage">
                  {[
                    ["#FFE58F","Warm yellow"],["#BFE8C8","Mint green"],["#B9DDF5","Sky blue"],["#F4C2D7","Soft rose"],["#D8C8F3","Lavender"],
                    ["#F7D1B5","Peach"],["#B7E5E0","Aqua"],["#C7D2FE","Periwinkle"],["#DCEBA8","Pistachio"],["#F6B6A6","Coral"]
                  ].map(([color,label])=><button key={color} className="selection-menu-color" style={{"--swatch":color}} title={"Highlight "+label} aria-label={"Highlight "+label} onClick={()=>saveHighlight(color)}/>)}
                </div>
                <button className="selection-menu-action" onClick={addSelectionAsNote}><NotebookPen size={14}/> Add to reading notes</button>
                <button className="selection-menu-action" onClick={copySelection}><FileText size={14}/> Copy selected text</button>
                <button className="selection-menu-dismiss" onClick={()=>setContextMenu(null)}>Cancel</button>
              </div>}
            </section>
            {annotationPopup && readMode && <div className="annotation-read-popover" onClick={event=>event.stopPropagation()}>
                <div className="annotation-read-head">
                  <span>YOUR ANNOTATION</span>
                  <button className="quiet-icon" aria-label="Close annotation" onClick={closeAnnotationPanel}><X size={14}/></button>
                </div>
                {editingAnnotationNoteId === null && <div className={"annotation-read-quote "+(annotationQuoteExpanded ? "expanded" : "compact")}><span>{annotationPopup.highlight.text}</span></div>}
                <section className="annotation-notes-area">
                  <div className="annotation-section-label">
                    <div><span>YOUR NOTES</span><small>{annotationPopup.notes.length} saved {annotationPopup.notes.length === 1 ? "note" : "notes"}</small></div>
                    <button className="annotation-add-note" onClick={()=>beginAnnotationEdit()}><Plus size={13}/> Add note</button>
                  </div>
                  <div className="annotation-note-list">
                    {annotationPopup.notes.length ? annotationPopup.notes.map(item=><article className="annotation-read-note" key={item.id}>
                      <div className="annotation-note-meta">
                        <span>NOTE · {dateLabel(item.created)}</span>
                        {editingAnnotationNoteId !== item.id && <div className="annotation-note-actions">
                          <button className="annotation-edit-button" onClick={()=>copyAnnotationText(item.text)}><Copy size={12}/> Copy</button>
                          <button className="annotation-edit-button" onClick={()=>beginAnnotationEdit(item)}><Pencil size={12}/> Edit</button>
                        </div>}
                      </div>
                      {editingAnnotationNoteId === item.id
                        ? <div className="annotation-editor">
                            <div ref={annotationEditorRef} className="annotation-rich-editor" contentEditable suppressContentEditableWarning onMouseUp={rememberAnnotationSelection} onKeyUp={rememberAnnotationSelection} onInput={rememberAnnotationSelection} role="textbox" aria-multiline="true" data-placeholder="Write your explanation, question, or connection…" dangerouslySetInnerHTML={{__html:item.html ? sanitizeAnnotationHtml(item.html) : escapeAnnotationHtml(item.text).replace(/\n/g,"<br>")}}/>
                            <div className="annotation-highlight-tools" role="toolbar" aria-label="Highlight selected note text">
                              <span>HIGHLIGHT SELECTED TEXT</span>
                              {[["#fff1a8","Yellow"],["#c9f2d5","Green"],["#cfe8ff","Blue"],["#f8d4e3","Pink"]].map(([color,label])=><button type="button" key={color} title={label+" highlight"} aria-label={label+" highlight"} style={{"--note-mark":color}} onMouseDown={event=>event.preventDefault()} onClick={()=>applyAnnotationHighlight(color)}/>)}
                            </div>
                            <div className="annotation-editor-actions"><button type="button" className="button button-secondary button-small" onClick={event=>{event.preventDefault();event.stopPropagation();cancelAnnotationEdit();}}>Cancel</button><button type="button" className="button button-primary button-small" disabled={annotationSaveBusy} onClick={saveAnnotationNote}>{annotationSaveBusy ? "Saving…" : <><Save size={13}/> Save changes</>}</button></div>
                          </div>
                        : item.html ? <div className="annotation-note-rich-text" dangerouslySetInnerHTML={{__html:sanitizeAnnotationHtml(item.html)}}/> : <p>{item.text}</p>}
                    </article>) : editingAnnotationNoteId !== "__new__" && <div className="annotation-empty-note"><p>No note is linked to this highlight yet.</p><button onClick={()=>beginAnnotationEdit()}><Pencil size={13}/> Write a note for this passage</button></div>}
                    {editingAnnotationNoteId === "__new__" && <div className="annotation-editor">
                    <div ref={annotationEditorRef} className="annotation-rich-editor" contentEditable suppressContentEditableWarning onMouseUp={rememberAnnotationSelection} onKeyUp={rememberAnnotationSelection} onInput={rememberAnnotationSelection} role="textbox" aria-multiline="true" data-placeholder="Write your explanation, question, or connection…" dangerouslySetInnerHTML={{__html:escapeAnnotationHtml(annotationDraft).replace(/\n/g,"<br>")}}/>
                    <div className="annotation-highlight-tools" role="toolbar" aria-label="Highlight selected note text">
                              <span>HIGHLIGHT SELECTED TEXT</span>
                              {[["#fff1a8","Yellow"],["#c9f2d5","Green"],["#cfe8ff","Blue"],["#f8d4e3","Pink"]].map(([color,label])=><button type="button" key={color} title={label+" highlight"} aria-label={label+" highlight"} style={{"--note-mark":color}} onMouseDown={event=>event.preventDefault()} onClick={()=>applyAnnotationHighlight(color)}/>)}
                            </div>
                    <div className="annotation-editor-actions"><button type="button" className="button button-secondary button-small" onClick={cancelAnnotationEdit}>Cancel</button><button type="button" className="button button-primary button-small" disabled={annotationSaveBusy} onClick={saveAnnotationNote}>{annotationSaveBusy ? "Saving…" : <><Save size={13}/> Save note</>}</button></div>
                  </div>}
                  </div>
                  <div className="annotation-notes-footer">
                    <button className="text-link" onClick={()=>{if(editingAnnotationNoteId && annotationDraft.trim() && !window.confirm("Discard your unsaved annotation changes before opening Research Notes?")) return; setAnnotationPopup(null);setEditingAnnotationNoteId(null);setAnnotationDraft("");setFocusedAnnotationId(annotationPopup.highlight.id);setAnnotationFilter("all");setAnnotationSearch("");setExpandedPaperIds(ids=>active&&!ids.includes(active.id)?[...ids,active.id]:ids);setRoute("notes");}}>Open in Research Notes <ChevronRight size={14}/></button>
                  </div>
                </section>
              </div>}
            <aside className="reader-side">
              <div className="reader-side-tabs">
                <button className={readerTab === "notes" ? "selected" : ""} onClick={() => setReaderTab("notes")}><NotebookPen size={14}/>Notes</button>
                <button className={readerTab === "highlights" ? "selected" : ""} onClick={() => setReaderTab("highlights")}><Highlighter size={14}/>Highlights</button>
                <button className={readerTab === "ai" ? "selected" : ""} onClick={() => setReaderTab("ai")}><Sparkles size={14}/>AI suggestions</button>
              </div>
              {readerTab === "notes" && <div className="reader-side-scroll">
                <section className="side-card"><div className="card-eyebrow">{noteAnchor ? "PASSAGE-LINKED NOTE · PAGE "+noteAnchor.page : "PAGE "+page+" · READING NOTE"}</div><h3>{noteAnchor ? "What does this passage mean to you?" : "Capture a thought"}</h3>
                  {noteAnchor && <div className="note-anchor-preview"><span>LINKED PASSAGE</span><blockquote>“{noteAnchor.text}”</blockquote><button type="button" onClick={()=>setNoteAnchor(null)}>Remove passage link</button></div>}
                  <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder={noteAnchor ? "Explain it in your own words, question the claim, or connect it to another idea…" : "Record an explanation, question, connection or critique from this page."}/>
                  <button className="button button-primary button-full" onClick={saveNote} disabled={!note.trim() || !active}>Save {noteAnchor ? "linked note" : "note"}</button></section>
                <section className="side-card"><div className="card-eyebrow">THIS PAPER</div><h3>Recent thoughts</h3>{activeNotes.length ? [...activeNotes].sort((a,b)=>b.created-a.created).map(item=><article className={"note-entry "+(item.anchor ? "note-entry-linked" : "")} key={item.id}><button className="note-entry-jump" onClick={()=>scrollToPage(item.page)}><span>{item.anchor ? "LINKED PASSAGE" : "PAGE NOTE"} · PAGE {item.page} · {dateLabel(item.created)}</span><ChevronRight size={13}/></button>{item.anchor && <blockquote>{item.anchor.text}</blockquote>}<p>{item.text}</p></article>) : <p className="helper-copy">Notes for this paper will appear here.</p>}</section>
              </div>}
              {readerTab === "highlights" && <div className="reader-side-scroll">
                <section className="side-card"><div className="card-eyebrow">ANNOTATIONS</div><h3>{activeHighlights.length} saved highlights</h3><p className="helper-copy">Select text, right-click it, then choose a colour. Remove any highlight individually here, or use Undo last in the reader toolbar.</p>
                  {activeHighlights.length ? [...activeHighlights].sort((a,b)=>b.created-a.created).map(item=><article className="highlight-entry" key={item.id}><div><span>{(item.category || "GENERAL").toUpperCase()} · PAGE {item.page}</span><p>{item.text}</p><button className="highlight-note-link" onClick={()=>{setNoteAnchor({text:item.text,page:item.page,rects:item.rects || [],normalized:!!item.normalized,selectionVersion:item.selectionVersion || 4,highlightId:item.id});setNote("");setReaderTab("notes");}}>Add linked note</button></div><button className="quiet-icon" title="Remove this highlight" onClick={() => removeHighlight(item.id)}><Trash2 size={15}/></button></article>) : <p className="helper-copy">No highlights saved for this paper yet.</p>}
                </section>
              </div>}
              {readerTab === "ai" && <div className="reader-side-scroll">
                <section className="side-card ai-assistant-card"><div className="card-eyebrow">DOCUMENT-SPECIFIC ASSISTANT</div><h3>AI suggestions for this paper</h3><p>This space is reserved for analysis of <b>{active?.name || "the selected paper"}</b>: plain-language summary, contributions, methods, limitations, research questions and concept explanations grounded in its text.</p><div className="ai-status"><Sparkles size={17}/><span><b>Local AI is not connected yet</b><small>No text is sent to an external AI service. The local model will run in your browser after setup.</small></span></div><button className="button button-secondary button-full" disabled>Local AI setup — next milestone</button></section>
              </div>}
            </aside>
          </div>
        </div>}

        {view === "notes" && <div className="content research-notes-content">
          <section className="page-heading"><div><div className="eyebrow">YOUR THINKING, PRESERVED</div><h1>Research notes</h1><p>Notes and highlights stay grouped with their source paper and original passage.</p></div><button className="button button-secondary" onClick={exportNotes}><Download size={16}/> Export notes</button></section>
          <div className="annotation-controls"><label className="search-box"><Search size={17}/><input value={annotationSearch} onChange={event=>setAnnotationSearch(event.target.value)} placeholder="Search notes, passages and papers"/></label><div className="annotation-filter">{["all","notes","highlights","linked"].map(value=><button key={value} className={annotationFilter===value?"selected":""} onClick={()=>setAnnotationFilter(value)}>{value==="all"?"All":value==="notes"?"Notes":value==="highlights"?"Highlights":"Linked notes"}</button>)}</div></div>
          <div className="notes-list-page">{papers.map(paper=>{
            const q=annotationSearch.trim().toLowerCase();
            const ns=(paper.notes||[]).filter(item=>(annotationFilter==="all"||annotationFilter==="notes"||(annotationFilter==="linked"&&item.anchor))&&(paper.name+" "+item.text+" "+(item.anchor?.text||"")).toLowerCase().includes(q));
            const hs=(paper.highlights||[]).filter(item=>(annotationFilter==="all"||annotationFilter==="highlights")&&(paper.name+" "+item.text+" "+(item.category||"")).toLowerCase().includes(q));
            const count=ns.length+hs.length; if(!count)return null;
            const expanded=expandedPaperIds.includes(paper.id)||[...ns,...hs].some(item=>item.id===focusedAnnotationId||item.anchor?.highlightId===focusedAnnotationId);
            return <article className={"paper-annotation-card "+(expanded?"expanded":"")} key={paper.id}>
              <button className="paper-annotation-header" onClick={()=>setExpandedPaperIds(ids=>ids.includes(paper.id)?ids.filter(id=>id!==paper.id):[...ids,paper.id])} aria-expanded={expanded}><span className="paper-annotation-icon"><FileText size={20}/></span><span className="paper-annotation-title"><strong>{paper.name}</strong><small>{(paper.notes||[]).length} notes · {(paper.highlights||[]).length} highlights</small></span><span className="paper-annotation-count">{count}</span><ChevronDown size={17}/></button>
              {expanded&&<div className="paper-annotation-body">
                {ns.map(item=>{const targetId=item.anchor?.highlightId||item.id;return <article id={"annotation-"+targetId} className={"research-note-card "+(focusedAnnotationId===targetId?"annotation-focused":"")} key={"note-"+item.id}><div className="note-card-meta"><span>{item.anchor?"Linked note":"Personal note"}</span><span>PAGE {item.page} · {dateLabel(item.created)}</span></div>{item.anchor&&<blockquote className="annotation-source-quote">{item.anchor.text}</blockquote>}<p>{item.text}</p><button className="text-link" onClick={()=>openAnnotation(paper.id,item,"note")}>Open source passage <ChevronRight size={14}/></button></article>;})}
                {hs.map(item=><article id={"annotation-"+item.id} className={"research-note-card highlight-note-card "+(focusedAnnotationId===item.id?"annotation-focused":"")} key={"highlight-"+item.id}><div className="note-card-meta"><span><i className="annotation-color-dot" style={{background:item.color||"#ffe36b"}}/>{item.category||"Highlight"}</span><span>PAGE {item.page} · {dateLabel(item.created)}</span></div><blockquote className="annotation-source-quote">{item.text}</blockquote>{(paper.notes||[]).filter(note=>note.anchor&&(note.anchor.highlightId===item.id||(note.page===item.page&&note.anchor.text===item.text))).map(note=><div className="annotation-linked-thought" key={note.id}><span>YOUR NOTE</span><p>{note.text}</p></div>)}<button className="text-link" onClick={()=>openAnnotation(paper.id,item,"highlight")}>Open highlighted passage <ChevronRight size={14}/></button></article>)}
              </div>}
            </article>;
          })}
          {!hasVisibleAnnotations&&<div className="empty-state"><div className="empty-icon"><NotebookPen size={24}/></div><h3>No annotations yet</h3><p>Open a paper and save a note or highlight. They will be grouped here by source paper.</p><button className="button button-primary" onClick={()=>setRoute("library")}>Go to library</button></div>}
          </div>
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

export default App;