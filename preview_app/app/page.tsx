"use client";

import { useState, useRef } from "react";

interface GeneratedComponent {
  ts: string;
  html: string;
  scss: string;
  prompt: string;
  timestamp: string;
}

// Design system token → actual value map
const TOKENS: Record<string, string> = {
  "primary":           "#6366f1",
  "primary-dark":      "#4f46e5",
  "primary-light":     "#818cf8",
  "secondary":         "#0ea5e9",
  "accent":            "#f59e0b",
  "success":           "#10b981",
  "error":             "#ef4444",
  "surface":           "#ffffff",
  "surface-dark":      "#1e1e2e",
  "background":        "#f8fafc",
  "background-dark":   "#0f0f1a",
  "text-primary":      "#1e293b",
  "text-secondary":    "#64748b",
  "text-muted":        "#94a3b8",
  "border":            "#e2e8f0",
  "glass-bg":          "rgba(255,255,255,0.1)",
  "glass-border":      "rgba(255,255,255,0.2)",
  "shadow-glass":      "0 8px 32px rgba(31,38,135,0.15)",
  "shadow-md":         "0 8px 16px rgba(0,0,0,0.1)",
  "border-radius-sm":  "4px",
  "border-radius":     "8px",
  "border-radius-lg":  "12px",
  "border-radius-xl":  "16px",
  "border-radius-full":"9999px",
};

// Replace #token-name with actual CSS values
function resolveTokens(css: string): string {
  // Sort by length descending so longer tokens match first (e.g. border-radius-lg before border-radius)
  var keys = Object.keys(TOKENS).sort(function(a,b){ return b.length - a.length; });
  var result = css;
  keys.forEach(function(k) {
    // Match #token-name not followed by more hex chars
    var re = new RegExp("#" + k.replace(/-/g,"\\-") + "(?![\\w-])", "g");
    result = result.replace(re, TOKENS[k]);
  });
  return result;
}

// Extract inline template from TypeScript component
function extractTemplateFromTs(ts: string): string {
  // Match template: `...` or template: "..."
  var backtick = ts.match(/template\s*:\s*`([\s\S]*?)`/);
  if (backtick) return backtick[1].trim();
  var single = ts.match(/template\s*:\s*'([\s\S]*?)'/);
  if (single) return single[1].trim();
  var dbl = ts.match(/template\s*:\s*"([\s\S]*?)"/);
  if (dbl) return dbl[1].trim();
  return "";
}

// Extract inline styles from TypeScript component
function extractStylesFromTs(ts: string): string {
  // styles: [`...`] or styles: ["..."] or styles: `...`
  var arr = ts.match(/styles\s*:\s*\[`([\s\S]*?)`\]/);
  if (arr) return arr[1].trim();
  var single = ts.match(/styles\s*:\s*\[`([\s\S]*?)`\]/);
  if (single) return single[1].trim();
  var plain = ts.match(/styles\s*:\s*`([\s\S]*?)`/);
  if (plain) return plain[1].trim();
  return "";
}

function scssToPlainCss(scss: string): string {
  var css = scss;
  css = css.replace(/@use[^\n]*/g, "");
  css = css.replace(/@forward[^\n]*/g, "");
  css = css.replace(/\$[\w-]+\s*:[^;]+;/g, "");
  css = css.replace(/\$[\w-]+/g, "inherit");
  css = css.replace(/::ng-deep/g, "");
  css = css.replace(/@include[^;]+;/g, "");
  css = css.replace(/@mixin[\s\S]*?\}/g, "");
  css = css.replace(/:host\s*\{([\s\S]*?)\}/g, "$1");
  // Flatten nesting
  for (var i = 0; i < 5; i++) {
    css = css.replace(
      /([.#\w][^{@]*?)\s*\{\s*([^{}]*?)([.#&:\s][\w\s>~+.#:[\]"'=-]*?)\s*\{([^{}]*?)\}/g,
      function(_, parent, before, child, inner) {
        var p = parent.trim();
        var c = child.trim().replace(/^&/, p);
        return p + "{" + before + "}" + " " + c + "{" + inner + "}";
      }
    );
  }
  return resolveTokens(css.trim());
}

function angularToHtml(html: string, ts: string): string {
  // If HTML is empty or just a comment, extract template from TS
  var body = html.trim();
  var isEmptyHtml = !body || /^<!--[\s\S]*?-->$/.test(body) || body.length < 20;
  if (isEmptyHtml) {
    body = extractTemplateFromTs(ts);
  }
  if (!body) return "<p style='color:#94a3b8;text-align:center'>No template found</p>";

  // Extract array data from TS for *ngFor
  var data: Record<string, any[]> = {};
  var arrRe = /(\w+)\s*(?::[^=]*)?\s*=\s*\[([\s\S]*?)\];/g;
  var mm: RegExpExecArray | null;
  while ((mm = arrRe.exec(ts)) !== null) {
    try {
      var cleaned = mm[2]
        .replace(/\/\/.*/g, "")
        .replace(/(\w+)\s*:/g, '"$1":')
        .replace(/'/g, '"')
        .replace(/,(\s*[}\]])/g, "$1");
      data[mm[1]] = JSON.parse("[" + cleaned + "]");
    } catch(e) { data[mm[1]] = []; }
  }

  var out = body;

  // Expand *ngFor
  var safety = 0;
  var ngforRe = /<([\w-]+)([^>]*)\*ngFor="let\s+(\w+)\s+of\s+(\w+)[^"]*"([^>]*)>([\s\S]*?)<\/\1>/;
  while (ngforRe.test(out) && safety++ < 10) {
    out = out.replace(ngforRe, function(_, tag, pre, itemVar, listVar, post, inner) {
      var items: any[] = data[listVar] || [
        {title:"Item 1",value:"100",name:"One",label:"A",color:"#6366f1"},
        {title:"Item 2",value:"200",name:"Two",label:"B",color:"#0ea5e9"},
        {title:"Item 3",value:"300",name:"Three",label:"C",color:"#10b981"},
      ];
      return items.map(function(item: any) {
        var innerFilled = inner.replace(/\{\{\s*\w+\.(\w+)[^}]*\}\}/g, function(_2: string, prop: string) {
          return item[prop] !== undefined ? String(item[prop]) : "";
        });
        var attrs = (pre + " " + post)
          .replace(/\*ngFor="[^"]*"/g, "")
          .replace(/\[ngStyle\]="(\{[^"]*\})"/g, function(_2: string, obj: string) {
            try {
              var o = JSON.parse(obj.replace(/'/g,'"').replace(/(\w[\w-]*):/g,'"$1":')) as Record<string,string>;
              var parts: string[] = [];
              Object.keys(o).forEach(function(k) {
                var v = String(o[k]);
                if (v.indexOf(".") > -1) {
                  var vp = v.split(".");
                  if (item[vp[1]] !== undefined) v = String(item[vp[1]]);
                }
                parts.push(k + ":" + v);
              });
              return 'style="' + parts.join(";") + '"';
            } catch(e) { return ""; }
          })
          .replace(/\[[^\]]+\]="[^"]*"/g, "")
          .replace(/\([^)]+\)="[^"]*"/g, "");
        return "<" + tag + " " + attrs.trim() + ">" + innerFilled + "</" + tag + ">";
      }).join("\n");
    });
  }

  // Replace {{ expr }}
  out = out.replace(/\{\{\s*([\w.]+)[^}]*\}\}/g, function(_, expr) {
    var parts = expr.split(".");
    var key = parts[parts.length - 1];
    var vals = Object.values(data);
    for (var i2 = 0; i2 < vals.length; i2++) {
      var arr = vals[i2];
      if (Array.isArray(arr) && arr[0] && arr[0][key] !== undefined) return String(arr[0][key]);
    }
    return key;
  });

  // Strip remaining Angular syntax
  out = out.replace(/\[ngStyle\]="[^"]*"/g, "");
  out = out.replace(/\[ngClass\]="[^"]*"/g, "");
  out = out.replace(/\[[^\]]+\]="[^"]*"/g, "");
  out = out.replace(/\([^)]+\)="[^"]*"/g, "");
  out = out.replace(/\*\w+="[^"]*"/g, "");
  out = out.replace(/\b(formControlName|formGroup|routerLink|routerLinkActive|matInput|matPrefix|matSuffix|mat-raised-button|mat-button|mat-icon-button|mat-stroked-button|mat-flat-button)(?:="[^"]*")?/g, "");
  out = out.replace(/<mat-icon[^>]*>([\s\S]*?)<\/mat-icon>/g, "<span>$1</span>");
  out = out.replace(/<mat-form-field[^>]*>/g, '<div class="field">');
  out = out.replace(/<\/mat-form-field>/g, "</div>");
  out = out.replace(/<mat-label[^>]*>([\s\S]*?)<\/mat-label>/g, "<label>$1</label>");
  out = out.replace(/<(mat-card|mat-toolbar|mat-nav-list|mat-list|mat-chip|mat-select|mat-option|mat-checkbox|mat-radio-button|mat-slide-toggle|mat-tab-group|mat-tab|mat-expansion-panel|mat-divider)([^>]*)>/g, '<div class="$1"$2>');
  out = out.replace(/<\/(mat-card|mat-toolbar|mat-nav-list|mat-list|mat-chip|mat-select|mat-option|mat-checkbox|mat-radio-button|mat-slide-toggle|mat-tab-group|mat-tab|mat-expansion-panel|mat-divider)>/g, "</div>");
  return out.trim();
}

function buildSrcdoc(c: GeneratedComponent): string {
  // Get CSS — prefer SCSS block, fallback to inline styles from TS
  var rawCss = c.scss.trim();
  if (!rawCss || rawCss.length < 10) rawCss = extractStylesFromTs(c.ts);
  var css = scssToPlainCss(rawCss);
  var body = angularToHtml(c.html, c.ts);

  var parts = [
    "<!DOCTYPE html><html><head><meta charset='UTF-8'>",
    "<link href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' rel='stylesheet'>",
    "<style>",
    "*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}",
    "body{background:#0f0f1a;font-family:'Inter',sans-serif;padding:2rem;min-height:100vh;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:1rem}",
    "input,button,select,textarea{font-family:inherit}",
    "button{cursor:pointer}",
    ".field{display:flex;flex-direction:column;gap:4px;margin-bottom:12px}",
    ".field label{font-size:.75rem;color:#94a3b8}",
    ".field input,.field textarea{padding:8px 12px;border-radius:8px;border:1px solid #334155;background:rgba(255,255,255,.05);color:#e2e8f0;width:100%}",
    css,
    "</style></head><body>",
    body,
    "</body></html>"
  ];
  return parts.join("\n");
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [component, setComponent] = useState<GeneratedComponent | null>(null);
  const [history, setHistory] = useState<GeneratedComponent[]>([]);
  const [activeTab, setActiveTab] = useState<"preview"|"ts"|"html"|"scss"|"debug">("preview");
  const [error, setError] = useState("");
  const [isFollowUp, setIsFollowUp] = useState(false);
  const [srcdoc, setSrcdoc] = useState("");
  const conversationRef = useRef<Array<{role:string;content:string}>>([]);

  const generate = async () => {
    if (!prompt.trim() || !apiKey.trim()) { setError("Enter prompt and Groq API key."); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({prompt:prompt.trim(), apiKey:apiKey.trim(), conversationHistory:conversationRef.current}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const nc: GeneratedComponent = {ts:data.ts||"", html:data.html||"", scss:data.scss||"", prompt, timestamp:new Date().toLocaleTimeString()};
      conversationRef.current = [...conversationRef.current, {role:"user",content:prompt}, {role:"assistant",content:data.raw||""}];
      const doc = buildSrcdoc(nc);
      setSrcdoc(doc);
      setComponent(nc);
      setHistory(p=>[nc,...p].slice(0,10));
      setIsFollowUp(true); setPrompt(""); setActiveTab("preview");
    } catch(e:any) { setError(e.message); } finally { setLoading(false); }
  };

  const reset = () => { conversationRef.current=[]; setIsFollowUp(false); setComponent(null); setPrompt(""); setError(""); setSrcdoc(""); };

  const exportTsx = () => {
    if (!component) return;
    var esc = component.html.replace(/`/g,"\\`").replace(/\$/g,"\\$");
    var lines = ['import React from "react";', "const styles = `" + component.scss + "`;", "export default function Preview() {", "  return (<><style dangerouslySetInnerHTML={{__html:styles}}/><div dangerouslySetInnerHTML={{__html:`" + esc + "`}}/></>);", "}"];
    var blob = new Blob([lines.join("\n")], {type:"text/plain"});
    var url = URL.createObjectURL(blob); var a = document.createElement("a"); a.href=url; a.download="component.tsx"; a.click(); URL.revokeObjectURL(url);
  };

  const B: React.CSSProperties = {background:"transparent",border:"1px solid #334155",color:"#94a3b8",borderRadius:8,padding:"8px 12px",cursor:"pointer",fontSize:"0.85rem",width:"100%"};
  const I: React.CSSProperties = {width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid #334155",background:"rgba(255,255,255,0.05)",color:"#e2e8f0",fontSize:"0.85rem",outline:"none"};

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#0f0f1a",color:"#e2e8f0",fontFamily:"Inter,sans-serif"}}>
      <header style={{borderBottom:"1px solid rgba(255,255,255,0.1)",padding:"12px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div>
          <h1 style={{color:"#6366f1",fontWeight:700,fontSize:"1.05rem"}}>🏗️ Guided Component Architect</h1>
          <p style={{color:"#64748b",fontSize:"0.7rem"}}>Live Preview · Groq + Llama 3.3</p>
        </div>
        <button onClick={reset} style={{...B,width:"auto",fontSize:"0.75rem"}}>🔄 New</button>
      </header>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        <div style={{width:280,flexShrink:0,borderRight:"1px solid rgba(255,255,255,0.1)",display:"flex",flexDirection:"column",padding:14,gap:12,overflowY:"auto"}}>
          <div>
            <label style={{color:"#94a3b8",fontSize:"0.72rem",display:"block",marginBottom:5}}>Groq API Key</label>
            <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="gsk_..." style={I}/>
            <p style={{color:"#475569",fontSize:"0.68rem",marginTop:3}}>Free · console.groq.com</p>
          </div>
          <div style={{flex:1}}>
            <label style={{color:"#94a3b8",fontSize:"0.72rem",display:"block",marginBottom:5}}>{isFollowUp?"✏️ Follow-up":"📝 Describe component"}</label>
            <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={6}
              placeholder={isFollowUp?"Now make the button rounded...":"A login card with glassmorphism..."}
              style={{...I,resize:"none"}}
              onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey))generate();}}/>
            <p style={{color:"#475569",fontSize:"0.68rem",marginTop:3}}>Ctrl+Enter to generate</p>
          </div>
          <button onClick={generate} disabled={loading}
            style={{width:"100%",padding:10,borderRadius:8,background:loading?"#4338ca":"#6366f1",color:"white",fontWeight:600,fontSize:"0.9rem",border:"none",cursor:loading?"not-allowed":"pointer",opacity:loading?0.75:1}}>
            {loading?"⚙️ Generating...":isFollowUp?"✏️ Apply Edit":"✨ Generate"}
          </button>
          {error && <div style={{background:"rgba(239,68,68,0.1)",color:"#f87171",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:"8px 12px",fontSize:"0.75rem"}}>{error}</div>}
          {component && <button onClick={exportTsx} style={B}>📦 Export .tsx</button>}
          {history.length>1 && (
            <div>
              <p style={{color:"#475569",fontSize:"0.68rem",marginBottom:5}}>History</p>
              {history.slice(1).map((h,i)=>(
                <button key={i} onClick={()=>{ const d=buildSrcdoc(h); setSrcdoc(d); setComponent(h); setActiveTab("preview"); }}
                  style={{...B,textAlign:"left",marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {h.timestamp} · {h.prompt.slice(0,24)}...
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {component ? (
            <>
              <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,0.1)",padding:"0 16px",flexShrink:0}}>
                {(["preview","ts","html","scss","debug"] as const).map(tab=>(
                  <button key={tab} onClick={()=>setActiveTab(tab)}
                    style={{padding:"11px 14px",fontSize:"0.82rem",fontWeight:500,border:"none",
                      borderBottom:"2px solid "+(activeTab===tab?"#6366f1":"transparent"),
                      color:activeTab===tab?"#6366f1":"#64748b",background:"transparent",cursor:"pointer"}}>
                    {tab==="preview"?"👁 Preview":tab==="ts"?"🟦 TS":tab==="html"?"🟧 HTML":tab==="scss"?"🎨 SCSS":"🐛 Debug"}
                  </button>
                ))}
              </div>
              <div style={{flex:1,overflow:"hidden"}}>
                {activeTab==="preview" && srcdoc && (
                  <iframe key={srcdoc.length + component.timestamp} srcDoc={srcdoc}
                    style={{width:"100%",height:"100%",border:"none",background:"#0f0f1a"}}
                    sandbox="allow-scripts allow-same-origin" title="Preview"/>
                )}
                {activeTab==="debug" && (
                  <pre style={{height:"100%",overflow:"auto",padding:16,background:"#0a0a14",color:"#86efac",fontFamily:"monospace",fontSize:"0.7rem",lineHeight:1.5,margin:0,whiteSpace:"pre-wrap"}}>
                    {srcdoc}
                  </pre>
                )}
                {(activeTab==="ts"||activeTab==="html"||activeTab==="scss") && (
                  <pre style={{height:"100%",overflow:"auto",padding:16,background:"#0d0d1a",color:"#a5b4fc",fontFamily:"monospace",fontSize:"0.78rem",lineHeight:1.6,margin:0}}>
                    <code>{activeTab==="ts"?component.ts:activeTab==="html"?component.html:component.scss}</code>
                  </pre>
                )}
              </div>
            </>
          ) : (
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14}}>
              <div style={{fontSize:"3.5rem"}}>🏗️</div>
              <p style={{color:"#475569",fontSize:"1rem",fontWeight:500}}>Enter a prompt to get started</p>
              <div style={{color:"#334155",fontSize:"0.82rem",textAlign:"center",lineHeight:2}}>
                <p>💡 &quot;A login card with glassmorphism&quot;</p>
                <p>💡 &quot;A dashboard stats card&quot;</p>
                <p>💡 &quot;A responsive navbar&quot;</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}