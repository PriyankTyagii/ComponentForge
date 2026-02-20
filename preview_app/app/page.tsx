"use client";

import { useState, useRef, useEffect } from "react";

interface GeneratedComponent {
  ts: string;
  html: string;
  scss: string;
  prompt: string;
  timestamp: string;
}

const TOKENS: Record<string, string> = {
  "primary":"#6366f1","primary-dark":"#4f46e5","primary-light":"#818cf8",
  "secondary":"#0ea5e9","accent":"#f59e0b","success":"#10b981","error":"#ef4444",
  "surface":"#ffffff","surface-dark":"#1e1e2e","background":"#f8fafc","background-dark":"#0f0f1a",
  "text-primary":"#1e293b","text-secondary":"#64748b","text-muted":"#94a3b8","border":"#e2e8f0",
  "glass-bg":"rgba(255,255,255,0.1)","glass-border":"rgba(255,255,255,0.2)",
  "shadow-glass":"0 8px 32px rgba(31,38,135,0.15)","shadow-md":"0 8px 16px rgba(0,0,0,0.1)",
  "border-radius-sm":"4px","border-radius":"8px","border-radius-lg":"12px",
  "border-radius-xl":"16px","border-radius-full":"9999px",
};

const SUGGESTIONS = [
  "A glassmorphism login card with email and password",
  "A simple button component with hover effects",
  "A user profile card with avatar and stats",
  "A notification badge component",
  "A toggle switch with smooth animation",
  "A simple search input with icon",
];

function resolveTokens(css: string): string {
  var keys = Object.keys(TOKENS).sort(function(a,b){return b.length-a.length;});
  var result = css;
  keys.forEach(function(k){
    var re = new RegExp("#"+k.replace(/-/g,"\\-")+"(?![\\w-])","g");
    result = result.replace(re, TOKENS[k]);
  });
  return result;
}

function extractTemplateFromTs(ts: string): string {
  var bt = ts.match(/template\s*:\s*`([\s\S]*?)`/);
  if(bt) return bt[1].trim();
  var sq = ts.match(/template\s*:\s*'([\s\S]*?)'/);
  if(sq) return sq[1].trim();
  return "";
}

function extractStylesFromTs(ts: string): string {
  var arr = ts.match(/styles\s*:\s*\[`([\s\S]*?)`\]/);
  if(arr) return arr[1].trim();
  var plain = ts.match(/styles\s*:\s*`([\s\S]*?)`/);
  if(plain) return plain[1].trim();
  return "";
}

function scssToPlainCss(scss: string): string {
  var css = scss;
  css = css.replace(/@use[^\n]*/g,"").replace(/@forward[^\n]*/g,"");
  css = css.replace(/\$[\w-]+\s*:[^;]+;/g,"").replace(/\$[\w-]+/g,"inherit");
  css = css.replace(/::ng-deep/g,"").replace(/@include[^;]+;/g,"").replace(/@mixin[\s\S]*?\}/g,"");
  css = css.replace(/:host\s*\{([\s\S]*?)\}/g,"$1");
  for(var i=0;i<5;i++){
    css = css.replace(/([.#\w][^{@]*?)\s*\{\s*([^{}]*?)([.#&:\s][\w\s>~+.#:[\]"'=-]*?)\s*\{([^{}]*?)\}/g,
      function(_,parent,before,child,inner){
        var p=parent.trim();var c=child.trim().replace(/^&/,p);
        return p+"{"+before+"} "+c+"{"+inner+"}";
      });
  }
  return resolveTokens(css.trim());
}

function angularToHtml(html: string, ts: string): string {
  var data: Record<string,any[]>={};
  var arrRe=/(\w+)\s*(?::[^=]*)?\s*=\s*\[([\s\S]*?)\];/g, mm: RegExpExecArray|null;
  while((mm=arrRe.exec(ts))!==null){
    try{
      var cleaned=mm[2].replace(/\/\/.*/g,"").replace(/(\w+)\s*:/g,'"$1":').replace(/'/g,'"').replace(/,(\s*[}\]])/g,"$1");
      data[mm[1]]=JSON.parse("["+cleaned+"]");
    }catch(e){data[mm[1]]=[];}
  }
  var body=html.trim();
  var isEmpty=!body||/^<!--[\s\S]*?-->$/.test(body)||body.length<20;
  if(isEmpty) body=extractTemplateFromTs(ts);
  if(!body) return "<p style='color:#94a3b8;text-align:center;font-family:sans-serif;padding:2rem'>No template found</p>";
  var out=body;
  var safety=0;
  var ngforRe=/<([\w-]+)([^>]*)\*ngFor="let\s+(\w+)\s+of\s+(\w+)[^"]*"([^>]*)>([\s\S]*?)<\/\1>/;
  while(ngforRe.test(out)&&safety++<10){
    out=out.replace(ngforRe,function(_,tag,pre,itemVar,listVar,post,inner){
      var items:any[]=data[listVar]||[
        {title:"Item 1",value:"100",name:"One",label:"A",color:"#6366f1"},
        {title:"Item 2",value:"200",name:"Two",label:"B",color:"#0ea5e9"},
        {title:"Item 3",value:"300",name:"Three",label:"C",color:"#10b981"},
      ];
      return items.map(function(item:any){
        var innerFilled=inner.replace(/\{\{\s*\w+\.(\w+)[^}]*\}\}/g,function(_2:string,prop:string){
          return item[prop]!==undefined?String(item[prop]):"";
        });
        var attrs=(pre+" "+post).replace(/\*ngFor="[^"]*"/g,"")
          .replace(/\[ngStyle\]="(\{[^"]*\})"/g,function(_2:string,obj:string){
            try{
              var o=JSON.parse(obj.replace(/'/g,'"').replace(/(\w[\w-]*):/g,'"$1":')) as Record<string,string>;
              var parts:string[]=[];
              Object.keys(o).forEach(function(k){
                var v=String(o[k]);
                if(v.indexOf(".")>-1){var vp=v.split(".");if(item[vp[1]]!==undefined)v=String(item[vp[1]]);}
                parts.push(k+":"+v);
              });
              return 'style="'+parts.join(";")+'"';
            }catch(e){return "";}
          })
          .replace(/\[[^\]]+\]="[^"]*"/g,"").replace(/\([^)]+\)="[^"]*"/g,"");
        return "<"+tag+" "+attrs.trim()+">"+innerFilled+"</"+tag+">";
      }).join("\n");
    });
  }
  out=out.replace(/\{\{\s*([\w.]+)[^}]*\}\}/g,function(_,expr){
    var parts=expr.split(".");var key=parts[parts.length-1];
    var vals=Object.values(data);
    for(var i2=0;i2<vals.length;i2++){var arr=vals[i2];if(Array.isArray(arr)&&arr[0]&&arr[0][key]!==undefined)return String(arr[0][key]);}
    return key;
  });
  out=out.replace(/\[ngStyle\]="[^"]*"/g,"").replace(/\[ngClass\]="[^"]*"/g,"");
  out=out.replace(/\[[^\]]+\]="[^"]*"/g,"").replace(/\([^)]+\)="[^"]*"/g,"");
  out=out.replace(/\*\w+="[^"]*"/g,"");
  out=out.replace(/\b(formControlName|formGroup|routerLink|routerLinkActive|matInput|matPrefix|matSuffix|mat-raised-button|mat-button|mat-icon-button|mat-stroked-button|mat-flat-button)(?:="[^"]*")?/g,"");
  out=out.replace(/<mat-icon[^>]*>([\s\S]*?)<\/mat-icon>/g,"<span>$1</span>");
  out=out.replace(/<mat-form-field[^>]*>/g,'<div class="field">').replace(/<\/mat-form-field>/g,"</div>");
  out=out.replace(/<mat-label[^>]*>([\s\S]*?)<\/mat-label>/g,"<label>$1</label>");
  out=out.replace(/<(mat-card|mat-toolbar|mat-nav-list|mat-list|mat-chip|mat-select|mat-option|mat-checkbox|mat-radio-button|mat-slide-toggle|mat-tab-group|mat-tab|mat-expansion-panel|mat-divider)([^>]*)>/g,'<div class="$1"$2>');
  out=out.replace(/<\/(mat-card|mat-toolbar|mat-nav-list|mat-list|mat-chip|mat-select|mat-option|mat-checkbox|mat-radio-button|mat-slide-toggle|mat-tab-group|mat-tab|mat-expansion-panel|mat-divider)>/g,"</div>");
  return out.trim();
}

function buildSrcdoc(c: GeneratedComponent, dark: boolean): string {
  var rawCss=c.scss.trim();
  if(!rawCss||rawCss.length<10) rawCss=extractStylesFromTs(c.ts);
  var css=scssToPlainCss(rawCss);
  var body=angularToHtml(c.html,c.ts);
  var bg = dark ? "#111827" : "#f1f5f9";
  return [
    "<!DOCTYPE html><html><head><meta charset='UTF-8'>",
    "<link href='https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap' rel='stylesheet'>",
    "<style>",
    "*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}",
    "body{background:"+bg+";font-family:'DM Sans',sans-serif;padding:2.5rem;min-height:100vh;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:1.5rem;transition:background .3s}",
    "input,button,select,textarea{font-family:inherit}button{cursor:pointer}",
    ".field{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}",
    ".field label{font-size:.75rem;color:#9ca3af;font-weight:500;letter-spacing:.04em;text-transform:uppercase}",
    ".field input,.field textarea{padding:10px 14px;border-radius:10px;border:1px solid #374151;background:rgba(255,255,255,.06);color:#f9fafb;font-size:.9rem;outline:none;transition:border .2s}",
    ".field input:focus{border-color:#6366f1}",
    css,
    "</style></head><body>",
    body,
    "</body></html>"
  ].join("\n");
}

export default function Home() {
  const [dark, setDark] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [component, setComponent] = useState<GeneratedComponent|null>(null);
  const [history, setHistory] = useState<GeneratedComponent[]>([]);
  const [activeTab, setActiveTab] = useState<"preview"|"ts"|"html"|"scss"|"debug">("preview");
  const [error, setError] = useState("");
  const [isFollowUp, setIsFollowUp] = useState(false);
  const [srcdoc, setSrcdoc] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState("");
  const conversationRef = useRef<Array<{role:string;content:string}>>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(()=>{
    const saved = localStorage.getItem("cf_apikey");
    if(saved) setApiKey(saved);
    const savedTheme = localStorage.getItem("cf_theme");
    if(savedTheme) setDark(savedTheme==="dark");
  },[]);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("cf_theme", next?"dark":"light");
    // Rebuild srcdoc with new theme
    if(component) setSrcdoc(buildSrcdoc(component, next));
  };

  const saveKey = (k: string) => { setApiKey(k); localStorage.setItem("cf_apikey",k); };

  const generate = async () => {
    if(!prompt.trim()||!apiKey.trim()){setError("Enter both a prompt and your Groq API key.");return;}
    setError("");setLoading(true);
    try{
      const res = await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt:prompt.trim(),apiKey:apiKey.trim(),conversationHistory:conversationRef.current})});
      const data = await res.json();
      if(!res.ok) throw new Error(data.error||"Generation failed");
      const nc: GeneratedComponent={ts:data.ts||"",html:data.html||"",scss:data.scss||"",prompt,timestamp:new Date().toLocaleTimeString()};
      conversationRef.current=[...conversationRef.current,{role:"user",content:prompt},{role:"assistant",content:data.raw||""}];
      const doc=buildSrcdoc(nc,dark);
      setSrcdoc(doc);setComponent(nc);setHistory(p=>[nc,...p].slice(0,8));
      setIsFollowUp(true);setPrompt("");setActiveTab("preview");
    }catch(e:any){setError(e.message);}finally{setLoading(false);}
  };

  const reset = () => {conversationRef.current=[];setIsFollowUp(false);setComponent(null);setPrompt("");setError("");setSrcdoc("");};

  const copyCode = (text:string,label:string) => {
    navigator.clipboard.writeText(text);setCopied(label);setTimeout(()=>setCopied(""),2000);
  };

  const exportTsx = () => {
    if(!component) return;
    var esc=component.html.replace(/`/g,"\\`").replace(/\$/g,"\\$");
    var lines=['import React from "react";',"const styles = `"+component.scss+"`;",
      "export default function Preview(){",
      "  return(<><style dangerouslySetInnerHTML={{__html:styles}}/><div dangerouslySetInnerHTML={{__html:`"+esc+"`}}/></>);}"];
    var blob=new Blob([lines.join("\n")],{type:"text/plain"});
    var url=URL.createObjectURL(blob);var a=document.createElement("a");
    a.href=url;a.download="component.tsx";a.click();URL.revokeObjectURL(url);
  };

  // Theme tokens
  const t = {
    bg:        dark ? "#0a0a0f"                     : "#f8fafc",
    bgSub:     dark ? "rgba(255,255,255,0.015)"     : "rgba(0,0,0,0.02)",
    border:    dark ? "rgba(255,255,255,0.06)"      : "rgba(0,0,0,0.08)",
    borderMid: dark ? "rgba(255,255,255,0.07)"      : "rgba(0,0,0,0.07)",
    text:      dark ? "#f1f5f9"                     : "#0f172a",
    textSub:   dark ? "#64748b"                     : "#64748b",
    textMuted: dark ? "#334155"                     : "#94a3b8",
    inputBg:   dark ? "rgba(255,255,255,0.03)"      : "rgba(0,0,0,0.03)",
    inputBorder:dark? "rgba(255,255,255,0.07)"      : "rgba(0,0,0,0.1)",
    cardBg:    dark ? "rgba(255,255,255,0.03)"      : "#ffffff",
    chipBg:    dark ? "rgba(255,255,255,0.02)"      : "rgba(0,0,0,0.04)",
    codeBg:    dark ? "#050508"                     : "#1e1e2e",
    navBg:     dark ? "rgba(10,10,15,0.85)"         : "rgba(248,250,252,0.9)",
    success:   dark ? "#34d399"                     : "#059669",
    tabActive: "#818cf8",
    tabInactive:dark? "#475569"                     : "#94a3b8",
  };

  const tabs = [
    {id:"preview",label:"Preview",icon:"◉"},
    {id:"ts",label:"TypeScript",icon:"⬡"},
    {id:"html",label:"HTML",icon:"⬢"},
    {id:"scss",label:"SCSS",icon:"◈"},
    {id:"debug",label:"Debug",icon:"⚙"},
  ] as const;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:t.bg,color:t.text,fontFamily:"'DM Sans',sans-serif",overflow:"hidden",transition:"background .3s, color .3s"}}>

      {/* Navbar */}
      <nav style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",height:54,borderBottom:"1px solid "+t.border,flexShrink:0,background:t.navBg,backdropFilter:"blur(16px)",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,boxShadow:"0 4px 12px rgba(99,102,241,0.4)"}}>⚒</div>
          <span style={{fontWeight:700,fontSize:"0.92rem",letterSpacing:"-0.02em",color:t.text}}>ComponentForge</span>
          <span style={{fontSize:"0.6rem",padding:"2px 7px",borderRadius:20,background:"rgba(99,102,241,0.12)",color:"#818cf8",fontWeight:700,letterSpacing:"0.06em"}}>BETA</span>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {isFollowUp && (
            <button onClick={reset} style={{fontSize:"0.75rem",padding:"5px 12px",borderRadius:8,border:"1px solid "+t.border,color:t.textSub,background:t.chipBg,cursor:"pointer"}}>
              + New
            </button>
          )}
          <a href="https://github.com/PriyankTyagii/ComponentForge" target="_blank" rel="noreferrer"
            style={{fontSize:"0.75rem",padding:"5px 12px",borderRadius:8,border:"1px solid "+t.border,color:t.textSub,background:t.chipBg,cursor:"pointer",textDecoration:"none"}}>
            GitHub ↗
          </a>

          {/* Dark/Light toggle */}
          <button onClick={toggleDark}
            style={{position:"relative",width:52,height:28,borderRadius:999,border:"none",cursor:"pointer",
              background:dark?"linear-gradient(135deg,#6366f1,#8b5cf6)":"linear-gradient(135deg,#f59e0b,#fbbf24)",
              boxShadow:dark?"0 0 12px rgba(99,102,241,0.4)":"0 0 12px rgba(251,191,36,0.4)",
              transition:"all 0.35s cubic-bezier(0.34,1.56,0.64,1)",padding:0,flexShrink:0}}>
            {/* Track icons */}
            <span style={{position:"absolute",left:7,top:"50%",transform:"translateY(-50%)",fontSize:11,opacity:dark?0.4:0,transition:"opacity .3s",pointerEvents:"none"}}>☀</span>
            <span style={{position:"absolute",right:7,top:"50%",transform:"translateY(-50%)",fontSize:11,opacity:dark?1:0,transition:"opacity .3s",pointerEvents:"none",filter:"brightness(2)"}}>☾</span>
            {/* Thumb */}
            <span style={{position:"absolute",top:3,left:dark?26:3,width:22,height:22,borderRadius:"50%",
              background:"white",boxShadow:"0 2px 8px rgba(0,0,0,0.25)",transition:"left 0.35s cubic-bezier(0.34,1.56,0.64,1)",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:11}}>
              {dark?"☾":"☀"}
            </span>
          </button>
        </div>
      </nav>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* Sidebar */}
        <div style={{width:296,flexShrink:0,borderRight:"1px solid "+t.border,display:"flex",flexDirection:"column",background:t.bgSub,transition:"background .3s"}}>

          {/* API Key */}
          <div style={{padding:"14px 14px 0"}}>
            <div style={{borderRadius:12,border:"1px solid "+t.borderMid,background:t.cardBg,overflow:"hidden",transition:"background .3s"}}>
              <div style={{padding:"9px 13px",borderBottom:"1px solid "+t.border,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:"0.68rem",fontWeight:700,color:t.textSub,letterSpacing:"0.06em",textTransform:"uppercase"}}>Groq API Key</span>
                <a href="https://console.groq.com" target="_blank" rel="noreferrer" style={{fontSize:"0.67rem",color:"#6366f1",textDecoration:"none",fontWeight:500}}>Get free ↗</a>
              </div>
              <div style={{padding:"9px 13px",display:"flex",gap:6,alignItems:"center"}}>
                <input type={showKey?"text":"password"} value={apiKey} onChange={e=>saveKey(e.target.value)} placeholder="gsk_..."
                  style={{flex:1,background:"transparent",border:"none",outline:"none",color:t.text,fontSize:"0.8rem",fontFamily:"monospace"}}/>
                <button onClick={()=>setShowKey(!showKey)} style={{background:"none",border:"none",color:t.textSub,cursor:"pointer",fontSize:13,padding:2,lineHeight:1}}>
                  {showKey?"◉":"◎"}
                </button>
              </div>
            </div>
          </div>

          {/* Prompt */}
          <div style={{padding:"12px 14px",flex:1,display:"flex",flexDirection:"column",gap:10}}>
            <label style={{fontSize:"0.68rem",fontWeight:700,color:t.textSub,letterSpacing:"0.06em",textTransform:"uppercase"}}>
              {isFollowUp?"✦ Refine component":"✦ Describe component"}
            </label>
            <textarea ref={textareaRef} value={prompt} onChange={e=>setPrompt(e.target.value)} rows={6}
              placeholder={isFollowUp
                ?"Now make the button fully rounded...\nAdd a dark mode toggle...\nChange the card color..."
                :"A glassmorphism login card with\nemail, password and a sign-in button..."}
              style={{width:"100%",padding:"11px 13px",borderRadius:10,border:"1px solid "+t.inputBorder,
                background:t.inputBg,color:t.text,fontSize:"0.83rem",outline:"none",resize:"none",
                lineHeight:1.6,fontFamily:"'DM Sans',sans-serif",transition:"all .2s"}}
              onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey))generate();}}/>

            {/* Suggestions */}
            {!isFollowUp && (
              <div>
                <p style={{fontSize:"0.67rem",color:t.textMuted,fontWeight:600,marginBottom:6,letterSpacing:"0.04em"}}>TRY THESE →</p>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {SUGGESTIONS.map((s,i)=>(
                    <button key={i} onClick={()=>{setPrompt(s);textareaRef.current?.focus();}}
                      style={{fontSize:"0.75rem",padding:"7px 10px",borderRadius:8,border:"1px solid "+t.border,
                        background:t.chipBg,color:t.textSub,cursor:"pointer",textAlign:"left",
                        transition:"all .15s",lineHeight:1.4}}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button onClick={generate} disabled={loading}
              style={{width:"100%",padding:"10px",borderRadius:10,
                background:loading?"rgba(99,102,241,0.45)":"linear-gradient(135deg,#6366f1,#8b5cf6)",
                color:"white",fontWeight:600,fontSize:"0.86rem",border:"none",
                cursor:loading?"not-allowed":"pointer",
                boxShadow:loading?"none":"0 4px 18px rgba(99,102,241,0.35)",
                transition:"all .2s",letterSpacing:"0.01em"}}>
              {loading?"⚙  Generating...":isFollowUp?"↺  Apply refinement":"✦  Generate component"}
            </button>

            {error && (
              <div style={{borderRadius:10,padding:"9px 12px",background:"rgba(239,68,68,0.07)",
                border:"1px solid rgba(239,68,68,0.18)",color:"#fca5a5",fontSize:"0.76rem",lineHeight:1.5}}>
                {error}
              </div>
            )}

            {component && (
              <button onClick={exportTsx}
                style={{width:"100%",padding:"8px",borderRadius:8,border:"1px solid "+t.border,
                  color:t.textSub,background:t.chipBg,fontSize:"0.77rem",cursor:"pointer",transition:"all .15s"}}>
                ↓ Export as .tsx
              </button>
            )}
          </div>

          {/* History */}
          {history.length>1 && (
            <div style={{borderTop:"1px solid "+t.border,padding:"10px 14px"}}>
              <p style={{fontSize:"0.65rem",color:t.textMuted,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:7}}>History</p>
              <div style={{display:"flex",flexDirection:"column",gap:3}}>
                {history.slice(1).map((h,i)=>(
                  <button key={i} onClick={()=>{const d=buildSrcdoc(h,dark);setSrcdoc(d);setComponent(h);setActiveTab("preview");}}
                    style={{textAlign:"left",padding:"6px 9px",borderRadius:7,border:"1px solid transparent",
                      background:t.chipBg,color:t.textSub,fontSize:"0.71rem",cursor:"pointer",
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",transition:"all .15s"}}>
                    <span style={{color:t.textMuted,marginRight:5}}>{h.timestamp}</span>{h.prompt.slice(0,26)}...
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main content */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {component ? (
            <>
              {/* Tab bar */}
              <div style={{display:"flex",alignItems:"center",borderBottom:"1px solid "+t.border,
                padding:"0 18px",gap:1,flexShrink:0,background:t.bgSub,transition:"background .3s"}}>
                {tabs.map(tab=>(
                  <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                    style={{padding:"13px 15px",fontSize:"0.79rem",fontWeight:500,border:"none",
                      borderBottom:"2px solid "+(activeTab===tab.id?"#6366f1":"transparent"),
                      color:activeTab===tab.id?t.tabActive:t.tabInactive,
                      background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",gap:5,transition:"all .15s"}}>
                    <span style={{fontSize:9}}>{tab.icon}</span>{tab.label}
                  </button>
                ))}
                <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:7}}>
                  <span style={{fontSize:"0.69rem",padding:"3px 9px",borderRadius:20,
                    background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.18)",color:t.success}}>
                    ✓ Generated
                  </span>
                  {(activeTab==="ts"||activeTab==="html"||activeTab==="scss") && (
                    <button onClick={()=>copyCode(activeTab==="ts"?component.ts:activeTab==="html"?component.html:component.scss,activeTab)}
                      style={{fontSize:"0.7rem",padding:"3px 9px",borderRadius:6,border:"1px solid "+t.border,
                        color:copied===activeTab?t.success:t.textSub,background:t.chipBg,cursor:"pointer",transition:"all .2s"}}>
                      {copied===activeTab?"✓ Copied":"Copy"}
                    </button>
                  )}
                </div>
              </div>

              {/* Panel */}
              <div style={{flex:1,overflow:"hidden"}}>
                {activeTab==="preview" && srcdoc && (
                  <iframe key={srcdoc.length+component.timestamp} srcDoc={srcdoc}
                    style={{width:"100%",height:"100%",border:"none"}}
                    sandbox="allow-scripts allow-same-origin" title="Preview"/>
                )}
                {activeTab==="debug" && (
                  <pre style={{height:"100%",overflow:"auto",padding:20,background:t.codeBg,
                    color:"#4ade80",fontFamily:"monospace",fontSize:"0.68rem",lineHeight:1.6,margin:0,whiteSpace:"pre-wrap"}}>
                    {srcdoc}
                  </pre>
                )}
                {(activeTab==="ts"||activeTab==="html"||activeTab==="scss") && (
                  <pre style={{height:"100%",overflow:"auto",padding:20,background:t.codeBg,
                    color:"#a5b4fc",fontFamily:"monospace",fontSize:"0.77rem",lineHeight:1.7,margin:0}}>
                    <code>{activeTab==="ts"?component.ts:activeTab==="html"?component.html:component.scss}</code>
                  </pre>
                )}
              </div>
            </>
          ) : (
            /* Empty state */
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:28,padding:48,transition:"background .3s"}}>
              <div style={{textAlign:"center"}}>
                <div style={{width:68,height:68,borderRadius:20,
                  background:dark?"linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.2))":"linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.1))",
                  border:"1px solid rgba(99,102,241,0.2)",display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:30,margin:"0 auto 18px",boxShadow:dark?"0 0 40px rgba(99,102,241,0.15)":"none"}}>
                  ⚒
                </div>
                <h2 style={{fontSize:"1.35rem",fontWeight:700,color:t.text,letterSpacing:"-0.02em",marginBottom:8}}>
                  ComponentForge
                </h2>
                <p style={{color:t.textSub,fontSize:"0.87rem",maxWidth:360,lineHeight:1.65,margin:"0 auto"}}>
                  Describe any Angular component in plain English. Get validated, design-system-compliant TypeScript, HTML and SCSS instantly.
                </p>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,width:"100%",maxWidth:500}}>
                {SUGGESTIONS.map((s,i)=>(
                  <button key={i} onClick={()=>{setPrompt(s);textareaRef.current?.focus();}}
                    style={{padding:"11px 13px",borderRadius:10,border:"1px solid "+t.border,
                      background:t.cardBg,color:t.textSub,fontSize:"0.78rem",cursor:"pointer",
                      textAlign:"left",lineHeight:1.4,transition:"all .2s",
                      boxShadow:dark?"none":"0 1px 4px rgba(0,0,0,0.06)"}}>
                    {s}
                  </button>
                ))}
              </div>

              <div style={{display:"flex",gap:18,color:t.textMuted,fontSize:"0.75rem"}}>
                <span>⚡ Groq + Llama 3.3</span>
                <span>·</span>
                <span>🔍 Auto-validation</span>
                <span>·</span>
                <span>↺ Self-correction</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}