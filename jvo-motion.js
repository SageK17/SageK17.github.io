/* ============================================================================
   JVO Motion — kant-en-klare site-componenten (vanilla web components)
   ----------------------------------------------------------------------------
   Eén bestand, geen build. Laad met:  <script src="jvo-motion.js" defer></script>
   Elk component is een custom element met eigen Shadow DOM + stijl.
   Kleuren & duif komen uit de JVO-huisstijl; alles respecteert
   prefers-reduced-motion. Fonts (Big Shoulders Display / Geist / Geist Mono)
   worden van de pagina geërfd — zorg dat die geladen zijn (fonts.css).

   Componenten:
     <jvo-dove>            de mark: state="info|warn|clinch|celebrate|neutral",
                           mode="idle|think|land", size="44"
     <jvo-live>            live-puls + label (label="Live")
     <jvo-scorebug>        broadcast-scorebord: home / away / home-score /
                           away-score / clock / period / home-color / away-color
     <jvo-smart-card>      assistent-kaart: state, title, cta, dismissible, role
                           methodes: .show() .hide()  · event: jvo-cta, jvo-dismiss
     <jvo-toast>           toast-melding: state, duration; methode .show(msg,state)
                           of globaal: JVOToast('Opgeslagen','clinch')
     <jvo-goal>            doelpunt-overlay: home/away/score/minute;
                           methode .fire()  of globaal JVOGoal({...})
     <jvo-loader>          splash: duif vliegt in en landt; auto-hide, of .play()
     <jvo-countdown>       aftrap-teller: seconds / to; event jvo-countdown-done
     <jvo-field>           veldstatus: field/status(vrij|bezig|klaar|volgend)/home/away/clock
     <jvo-progress>        ring-voortgang: value(0-100, leeg=spinner)/size/label
     <jvo-empty>           lege staat met rustende duif: title/hint/state
     <jvo-standings>       ranglijst-rij: pos/team/played/points/highlight/delta
     <jvo-qrscan>          check-in scanner-frame; methode .ok() → jvo-scan-ok
   ============================================================================ */
(function () {
  'use strict';
  if (window.__jvoMotion) return;
  window.__jvoMotion = true;

  var DOVE = "M71.88 0.38 L75.13 0.63 L77.19 1.13 L78.06 1.88 L77.75 2.88 L76.25 4.13 L74.75 5.63 L73.25 7.38 L71.75 9.38 L70.25 11.63 L68.38 13.94 L66.13 16.31 L63.50 18.75 L60.50 21.25 L58.69 23.38 L58.06 25.13 L58.63 26.50 L60.38 27.50 L61.81 28.44 L62.94 29.31 L63.75 30.13 L64.25 30.88 L64.00 31.50 L63.00 32.00 L61.25 32.38 L58.75 32.63 L56.06 33.19 L53.19 34.06 L50.13 35.25 L46.88 36.75 L43.63 37.75 L40.38 38.25 L37.13 38.25 L33.88 37.75 L30.44 36.81 L26.81 35.44 L23.00 33.63 L19.00 31.38 L15.81 29.69 L13.44 28.56 L11.88 28.00 L11.13 28.00 L10.88 27.56 L11.13 26.69 L11.88 25.38 L13.13 23.63 L13.13 21.31 L11.88 18.44 L9.38 15.00 L5.63 11.00 L3.81 8.06 L3.94 6.19 L6.00 5.38 L10.00 5.63 L14.44 6.75 L19.31 8.75 L24.63 11.63 L30.38 15.38 L35.63 17.19 L40.38 17.06 L44.63 15.00 L48.38 11.00 L51.94 7.75 L55.31 5.25 L58.50 3.50 L61.50 2.50 L63.81 1.69 L65.44 1.06 L66.38 0.63 L66.63 0.38 L67.63 0.25 L69.38 0.25 Z";

  var C = {
    midnight:'#0A1628', midnight2:'#122544', midnight3:'#1A3158', hair:'rgba(232,244,255,.1)',
    ice:'#E8F4FF', iceMut:'rgba(232,244,255,.66)',
    info:'#FFB347', warn:'#FF6B1A', warn2:'#FF8A3D', clinch:'#6CE3A0', gold:'#FFCD7A', turq:'#2FD4C4',
    mono:"'Geist Mono',ui-monospace,monospace",
    body:"'Geist',system-ui,sans-serif",
    display:"'Big Shoulders Display',Impact,sans-serif"
  };
  function sev(state){
    return ({info:C.info, warn:C.warn, clinch:C.clinch, celebrate:C.gold, neutral:C.iceMut}[state] || C.info);
  }
  function doveSVG(cls){ return '<svg class="'+(cls||'')+'" viewBox="0 0 80 39"><path fill="currentColor" d="'+DOVE+'"/></svg>'; }
  var RM = '@media (prefers-reduced-motion:reduce){*{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}}';

  function define(name, cls){ if(!customElements.get(name)) customElements.define(name, cls); }
  function attach(el){ return el.attachShadow({mode:'open'}); }
  function css(root, text){ var s=document.createElement('style'); s.textContent=text; root.appendChild(s); }

  /* ---------------------------------------------------------------- jvo-dove */
  class JvoDove extends HTMLElement {
    static get observedAttributes(){ return ['state','mode','size']; }
    connectedCallback(){ if(!this.shadowRoot) this._build(); this._sync(); }
    attributeChangedCallback(){ if(this.shadowRoot) this._sync(); }
    _build(){
      var r = attach(this);
      css(r,
        ':host{display:inline-flex;line-height:0}'+
        '.wrap{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:'+C.midnight3+'}'+
        'svg{display:block;transform-origin:50% 62%}'+
        '.breathe{animation:b 3.6s ease-in-out infinite}'+
        '.think{animation:n 2.4s ease-in-out infinite;transform-origin:50% 70%}'+
        '@keyframes b{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-6%) scale(1.02)}}'+
        '@keyframes n{0%,100%{transform:rotate(0)}50%{transform:rotate(-7deg)}}'+
        '@keyframes flap{0%{transform:scaleY(.7)}10%{transform:scaleY(1.08)}22%{transform:scaleY(.66)}36%{transform:scaleY(1.05)}52%{transform:scaleY(.8)}100%{transform:scaleY(1)}}'+
        '.land{animation:flap 1.4s ease-in-out 1}'+
        RM
      );
      this._wrap = document.createElement('span');
      this._wrap.className='wrap';
      this._wrap.innerHTML = doveSVG();
      r.appendChild(this._wrap);
    }
    _sync(){
      var size = parseFloat(this.getAttribute('size')||'44');
      var state = this.getAttribute('state')||'info';
      var mode = this.getAttribute('mode')||'idle';
      var pad = Math.round(size*0.34);
      this._wrap.style.width = (size+pad)+'px';
      this._wrap.style.height = (size+pad)+'px';
      var svg = this._wrap.querySelector('svg');
      svg.style.width = size+'px'; svg.style.height='auto';
      this._wrap.style.color = sev(state);
      svg.className.baseVal = (mode==='idle'?'breathe':mode==='think'?'think':mode==='land'?'land':'');
    }
  }
  define('jvo-dove', JvoDove);

  /* ---------------------------------------------------------------- jvo-live */
  class JvoLive extends HTMLElement {
    connectedCallback(){
      var r = attach(this);
      var label = this.getAttribute('label')||'Live';
      var col = this.getAttribute('color')||C.warn;
      css(r,
        ':host{display:inline-flex}'+
        '.w{display:inline-flex;align-items:center;gap:8px}'+
        '.dot{position:relative;width:11px;height:11px;flex:none}'+
        '.dot i{position:absolute;inset:0;border-radius:50%;background:'+col+'}'+
        '.dot b{position:absolute;inset:0;border-radius:50%;border:2px solid '+col+';animation:p 1.8s ease-out infinite}'+
        '.t{font-family:'+C.mono+';font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:'+col+'}'+
        '@keyframes p{0%{opacity:.7;transform:scale(.6)}70%{opacity:0;transform:scale(2.3)}100%{opacity:0;transform:scale(2.3)}}'+
        RM
      );
      var w = document.createElement('span'); w.className='w';
      w.innerHTML = '<span class="dot"><i></i><b></b></span><span class="t">'+label+'</span>';
      r.appendChild(w);
    }
  }
  define('jvo-live', JvoLive);

  /* ------------------------------------------------------------ jvo-scorebug */
  class JvoScorebug extends HTMLElement {
    static get observedAttributes(){ return ['home','away','home-score','away-score','clock','period','home-color','away-color']; }
    connectedCallback(){ if(!this.shadowRoot) this._build(); this._sync(); }
    attributeChangedCallback(n,o,v){ if(this.shadowRoot) this._sync(n,o,v); }
    _build(){
      var r = attach(this);
      css(r,
        ':host{display:inline-block}'+
        '.bug{display:inline-flex;align-items:stretch;border-radius:12px;overflow:hidden;background:linear-gradient(180deg,#0e1f3a,#0b1830);box-shadow:0 14px 34px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.05);border:1px solid '+C.hair+'}'+
        '.bar{width:5px;animation:bp 2.4s ease-in-out infinite}'+
        '.bar.b2{animation-delay:.3s}'+
        '.mid{display:flex;align-items:center;gap:12px;padding:12px 15px}'+
        '.tag{width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-family:'+C.mono+';font-weight:700;font-size:10px;letter-spacing:.02em}'+
        '.tag.h{background:'+C.midnight3+';color:'+C.info+'}'+
        '.tag.a{background:#16294a;color:'+C.iceMut+'}'+
        '.score{display:flex;align-items:baseline;gap:8px;font-family:'+C.display+';font-weight:900;line-height:1}'+
        '.score .n{font-size:52px}'+
        '.score .h{color:'+C.gold+'}.score .a{color:'+C.ice+'}'+
        '.score .sep{color:rgba(232,244,255,.28);font-size:32px;align-self:center}'+
        '.clk{display:flex;flex-direction:column;align-items:center;gap:2px;padding-left:8px;margin-left:2px;border-left:1px solid rgba(232,244,255,.12)}'+
        '.clk .t{font-family:'+C.mono+';font-size:15px;font-weight:500;color:'+C.gold+';letter-spacing:.04em}'+
        '.clk .t i{font-style:normal;animation:ck 1s step-end infinite}'+
        '.clk .p{font-family:'+C.mono+';font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:rgba(232,244,255,.4)}'+
        '@keyframes bp{0%,100%{opacity:.55}50%{opacity:1}}'+
        '@keyframes ck{0%,49%{opacity:1}50%,100%{opacity:.25}}'+
        RM
      );
      this._el = document.createElement('div'); this._el.className='bug';
      r.appendChild(this._el);
    }
    _sync(){
      var g=this.getAttribute.bind(this);
      var home=g('home')||'JVO', away=g('away')||'GST';
      var hs=g('home-score')||'0', as=g('away-score')||'0';
      var clk=g('clock')||'', period=g('period')||'';
      var hc=g('home-color')||'#3D7BE0', ac=g('away-color')||'#E85C4A';
      var clkHTML = clk ? '<div class="clk"><span class="t">'+clk.replace(':','<i>:</i>')+'</span>'+(period?'<span class="p">'+period+'</span>':'')+'</div>' : '';
      this._el.innerHTML =
        '<div class="bar" style="background:linear-gradient(180deg,'+hc+',#2A5BB0)"></div>'+
        '<div class="mid">'+
          '<span class="tag h">'+home+'</span>'+
          '<div class="score"><span class="n h">'+hs+'</span><span class="sep">:</span><span class="n a">'+as+'</span></div>'+
          '<span class="tag a">'+away+'</span>'+ clkHTML +
        '</div>'+
        '<div class="bar b2" style="background:linear-gradient(180deg,'+ac+',#B23A2C)"></div>';
    }
  }
  define('jvo-scorebug', JvoScorebug);

  /* ---------------------------------------------------------- jvo-smart-card */
  class JvoSmartCard extends HTMLElement {
    static get observedAttributes(){ return ['state','title','cta','role','dismissible']; }
    connectedCallback(){ if(!this.shadowRoot) this._build(); this._sync(); if(this.getAttribute('auto')!=='false') requestAnimationFrame(()=>this.show()); }
    attributeChangedCallback(){ if(this.shadowRoot) this._sync(); }
    _build(){
      var r = attach(this);
      css(r,
        ':host{display:block}'+
        '.card{position:relative;background:'+C.midnight2+';border:1px solid '+C.hair+';border-left:4px solid '+C.info+';border-radius:14px;padding:14px 16px;'+
          'opacity:0;transform:translateY(16px) scale(.99);transition:opacity .32s cubic-bezier(.16,1,.3,1),transform .42s cubic-bezier(.16,1,.3,1),border-left-color .3s}'+
        '.card.in{opacity:1;transform:none}'+
        '.card.out{opacity:0;transform:translateY(-10px)}'+
        '.hd{display:flex;align-items:center;gap:9px;margin-bottom:8px}'+
        '.mk{position:relative;width:26px;height:26px;border-radius:50%;background:'+C.midnight3+';display:flex;align-items:center;justify-content:center;flex:none;color:'+C.info+'}'+
        '.mk svg{width:17px;height:auto;display:block}'+
        '.mk .ring{position:absolute;inset:-4px;border-radius:50%;border:1.5px solid currentColor;opacity:0}'+
        '.card.in .mk .ring{animation:rp 2.4s ease-out .2s}'+
        '.nm{font-family:'+C.mono+';font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:'+C.info+'}'+
        '.x{margin-left:auto;cursor:pointer;border:0;background:transparent;color:'+C.iceMut+';font-size:16px;line-height:1;padding:2px 4px;border-radius:6px}'+
        '.x:hover{color:'+C.ice+';background:rgba(232,244,255,.08)}'+
        '.tt{margin:0 0 3px;font-size:14.5px;font-weight:700;color:'+C.ice+'}'+
        '.bd{margin:0;font-size:13.5px;line-height:1.45;color:'+C.ice+'}'+
        '.bd ::slotted(b),.bd b{color:'+C.gold+';font-weight:600}'+
        '.cta{display:inline-block;margin-top:12px;background:'+C.info+';color:'+C.midnight+';border:0;border-radius:9px;padding:8px 15px;font-family:'+C.body+';font-size:12.5px;font-weight:700;cursor:pointer}'+
        '.cta:hover{filter:brightness(1.06)}'+
        '@keyframes rp{0%{opacity:.7;transform:scale(.6)}70%{opacity:0;transform:scale(1.9)}100%{opacity:0}}'+
        RM
      );
      this._card=document.createElement('div'); this._card.className='card';
      r.appendChild(this._card);
    }
    _sync(){
      var state=this.getAttribute('state')||'info', col=sev(state);
      var title=this.getAttribute('title')||'', cta=this.getAttribute('cta')||'';
      var role=this.getAttribute('role')||'JVO Smart';
      var dis=this.hasAttribute('dismissible');
      this._card.style.borderLeftColor=col;
      this._card.querySelector('.mk')&&0;
      this._card.innerHTML =
        '<div class="hd"><span class="mk" style="color:'+col+'">'+doveSVG()+'<span class="ring"></span></span>'+
          '<span class="nm" style="color:'+col+'">'+role+'</span>'+
          (dis?'<button class="x" aria-label="sluiten">&times;</button>':'')+
        '</div>'+
        (title?'<h3 class="tt">'+title+'</h3>':'')+
        '<p class="bd"><slot></slot></p>'+
        (cta?'<button class="cta" style="background:'+col+'">'+cta+'</button>':'');
      var x=this._card.querySelector('.x'); if(x) x.onclick=()=>this.hide();
      var c=this._card.querySelector('.cta'); if(c) c.onclick=()=>this.dispatchEvent(new CustomEvent('jvo-cta',{bubbles:true}));
    }
    show(){ this._card.classList.remove('out'); requestAnimationFrame(()=>this._card.classList.add('in')); }
    hide(){ this._card.classList.remove('in'); this._card.classList.add('out'); this.dispatchEvent(new CustomEvent('jvo-dismiss',{bubbles:true})); }
  }
  define('jvo-smart-card', JvoSmartCard);

  /* --------------------------------------------------------------- jvo-toast */
  var toastHost;
  class JvoToast extends HTMLElement {
    connectedCallback(){
      if(!this.shadowRoot) this._build();
      if(this.getAttribute('message')) this.show(this.getAttribute('message'), this.getAttribute('state')||'clinch');
    }
    _build(){
      var r=attach(this);
      css(r,
        ':host{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:9999;pointer-events:none}'+
        '.stack{display:flex;flex-direction:column;gap:10px;align-items:center}'+
        '.t{position:relative;display:flex;align-items:center;gap:10px;min-width:200px;max-width:360px;background:#0e1f3a;border:1px solid '+C.hair+';border-radius:12px;padding:12px 15px;overflow:hidden;'+
          'box-shadow:0 16px 40px rgba(0,0,0,.5);opacity:0;transform:translateY(14px);transition:opacity .3s,transform .3s;pointer-events:auto}'+
        '.t.in{opacity:1;transform:none}'+
        '.ic{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none}'+
        '.ic svg{width:13px;height:13px}'+
        '.msg{font-family:'+C.body+';font-size:13px;color:'+C.ice+';flex:1}'+
        '.pb{position:absolute;left:0;bottom:0;height:3px;width:100%;transform-origin:left}'+
        RM
      );
      this._stack=document.createElement('div'); this._stack.className='stack';
      r.appendChild(this._stack);
    }
    show(msg, state){
      state=state||'clinch'; var col=sev(state), dur=parseFloat(this.getAttribute('duration')||'3200');
      var t=document.createElement('div'); t.className='t';
      t.innerHTML='<span class="ic" style="background:'+col+'26"><svg viewBox="0 0 24 24" fill="none" stroke="'+col+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 L9 17 L4 12"/></svg></span>'+
        '<span class="msg">'+msg+'</span><span class="pb" style="background:'+col+'"></span>';
      this._stack.appendChild(t);
      var pb=t.querySelector('.pb');
      requestAnimationFrame(()=>{ t.classList.add('in'); pb.style.transition='transform '+dur+'ms linear'; pb.style.transform='scaleX(0)'; });
      setTimeout(()=>{ t.classList.remove('in'); setTimeout(()=>t.remove(),320); }, dur);
    }
  }
  define('jvo-toast', JvoToast);
  window.JVOToast = function(msg, state){
    if(!toastHost){ toastHost=document.createElement('jvo-toast'); document.body.appendChild(toastHost); }
    var go=()=>toastHost.show(msg,state);
    if(toastHost.shadowRoot) go(); else requestAnimationFrame(go);
  };

  /* ---------------------------------------------------------------- jvo-goal */
  class JvoGoal extends HTMLElement {
    connectedCallback(){ if(!this.shadowRoot) this._build(); if(this.hasAttribute('auto')) this.fire(); }
    _build(){
      var r=attach(this);
      css(r,
        ':host{position:fixed;inset:0;z-index:9998;pointer-events:none;display:flex;align-items:center;justify-content:center;opacity:0}'+
        ':host(.on){opacity:1}'+
        '.beam{position:absolute;left:50%;top:-30%;height:150%;transform-origin:top center;filter:blur(8px)}'+
        '.flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 46%,rgba(255,179,71,.5),transparent 58%);opacity:0}'+
        ':host(.on) .flash{animation:gf 1.1s ease-out}'+
        '.shock{position:absolute;width:160px;height:160px;border-radius:50%;border:3px solid '+C.info+';opacity:0}'+
        ':host(.on) .shock{animation:gs 1.4s ease-out}'+
        ':host(.on) .shock.d{animation-delay:.12s;border-color:'+C.gold+'}'+
        '.col{position:relative;display:flex;flex-direction:column;align-items:center;gap:16px}'+
        '.big{font-family:'+C.display+';font-weight:900;font-size:clamp(80px,15vw,190px);line-height:.9;text-transform:uppercase;'+
          'background:linear-gradient(180deg,'+C.gold+','+C.warn+');-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;'+
          'filter:drop-shadow(0 8px 26px rgba(255,107,26,.45));transform:scale(.4);opacity:0}'+
        ':host(.on) .big{animation:gt 1.5s cubic-bezier(.34,1.56,.5,1) forwards}'+
        '.line{display:flex;align-items:center;gap:12px;background:rgba(10,22,40,.72);border:1px solid rgba(255,205,122,.32);border-radius:12px;padding:9px 16px;opacity:0}'+
        ':host(.on) .line{animation:gl 1.6s ease forwards}'+
        '.line .s{font-family:'+C.mono+';font-size:15px;letter-spacing:.04em}'+
        '.conf{position:absolute;top:-6vh;width:9px;height:15px;border-radius:2px;opacity:0}'+
        ':host(.on) .conf{animation:gc 1.6s linear forwards}'+
        '@keyframes gf{0%{opacity:0}22%{opacity:1}100%{opacity:0}}'+
        '@keyframes gs{0%{opacity:0;transform:scale(.3)}20%{opacity:.8}100%{opacity:0;transform:scale(2.8)}}'+
        '@keyframes gt{0%{transform:scale(.4) translateY(10px);opacity:0}30%{opacity:1}45%{transform:scale(1.12)}60%{transform:scale(.97)}72%{transform:scale(1)}88%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1)}}'+
        '@keyframes gl{0%,18%{opacity:0;transform:translateY(20px)}32%{opacity:1;transform:none}86%{opacity:1}100%{opacity:0}}'+
        '@keyframes gc{0%{opacity:0;transform:translateY(0) rotate(0)}8%{opacity:1}100%{opacity:1;transform:translateY(110vh) rotate(420deg)}}'+
        RM
      );
      var beams='';
      [[-22,'rgba(255,205,122,.5)',60],[0,'rgba(255,138,61,.42)',52],[22,'rgba(255,205,122,.5)',60]].forEach(function(b,i){
        beams+='<div class="beam" style="width:'+b[2]+'px;transform:translateX(-50%) rotate('+b[0]+'deg);background:linear-gradient(180deg,'+b[1]+',transparent 78%)"></div>';
      });
      var conf=''; var cols=[C.warn,C.gold,C.ice,C.clinch,C.warn2];
      for(var i=0;i<26;i++){ conf+='<span class="conf" style="left:'+((i*79+11)%100)+'%;background:'+cols[i%5]+';animation-delay:'+((i*37)%90)/100+'s"></span>'; }
      this._core=document.createElement('div'); this._core.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center';
      this._core.innerHTML = beams + '<div class="flash"></div><span class="shock"></span><span class="shock d"></span>'+conf+
        '<div class="col"><span class="big">Goal!</span><div class="line"></div></div>';
      r.appendChild(this._core);
      this._line=this._core.querySelector('.line');
    }
    fire(opts){
      opts=opts||{};
      var home=opts.home||this.getAttribute('home')||'JVO';
      var away=opts.away||this.getAttribute('away')||'GST';
      var score=opts.score||this.getAttribute('score')||'';
      var min=opts.minute||this.getAttribute('minute')||'';
      this._line.innerHTML='<span class="s" style="color:'+C.gold+'">'+home+(score?' '+score.split('-')[0]:'')+'</span>'+
        (score?'<span style="color:rgba(232,244,255,.28)">·</span><span class="s" style="color:'+C.iceMut+'">'+score.split('-')[1]+' '+away+'</span>':'')+
        (min?'<span style="width:1px;height:13px;background:rgba(232,244,255,.16)"></span><span class="s" style="color:'+C.warn2+'">'+min+'\u2019</span>':'');
      this.classList.remove('on'); void this.offsetWidth; this.classList.add('on');
      clearTimeout(this._to); this._to=setTimeout(()=>this.classList.remove('on'), 3600);
    }
  }
  define('jvo-goal', JvoGoal);
  var goalHost;
  window.JVOGoal = function(opts){
    if(!goalHost){ goalHost=document.createElement('jvo-goal'); document.body.appendChild(goalHost); }
    var go=()=>goalHost.fire(opts);
    if(goalHost.shadowRoot) go(); else requestAnimationFrame(go);
  };

  /* -------------------------------------------------------------- jvo-loader */
  class JvoLoader extends HTMLElement {
    connectedCallback(){
      if(!this.shadowRoot) this._build();
      if(this.getAttribute('auto')!=='false') this.play(parseInt(this.getAttribute('duration')||'1900',10));
      else this.classList.add('done');
    }
    _build(){
      var r=attach(this);
      css(r,
        ':host{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:'+C.midnight+';transition:opacity .5s}'+
        ':host(.done){opacity:0;pointer-events:none}'+
        '.stage{position:relative;width:190px;height:190px}'+
        '.ring{position:absolute;inset:0;transform:rotate(-90deg)}'+
        '.ring circle{stroke-dasharray:534;stroke-dashoffset:534;animation:dr 1.1s .55s cubic-bezier(.4,0,.2,1) forwards}'+
        '.core{position:absolute;inset:20px;border-radius:50%;background:radial-gradient(circle at 50% 38%,#1a2c50,'+C.midnight+' 72%);box-shadow:inset 0 0 42px rgba(0,0,0,.55)}'+
        '.dove{position:absolute;left:50%;top:50%;width:80px;transform:translate(-50%,-50%);color:'+C.ice+';animation:fly 1.5s cubic-bezier(.16,.62,.24,1) both}'+
        '.dove svg{width:100%;height:auto;display:block;transform-origin:50% 62%;animation:flap 1.5s ease-in-out 1 both}'+
        '@keyframes dr{to{stroke-dashoffset:0}}'+
        '@keyframes fly{0%{opacity:0;transform:translate(-140%,-60%) scale(1.8) rotate(-15deg)}14%{opacity:1}100%{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(0)}}'+
        '@keyframes flap{0%{transform:scaleY(.7)}12%{transform:scaleY(1.08)}24%{transform:scaleY(.66)}40%{transform:scaleY(1.05)}58%{transform:scaleY(.82)}100%{transform:scaleY(1)}}'+
        RM
      );
      var s=document.createElement('div'); s.className='stage';
      s.innerHTML='<svg class="ring" viewBox="0 0 190 190"><circle cx="95" cy="95" r="85" fill="none" stroke="url(#jl-g)" stroke-width="3.4" stroke-linecap="round"/><defs><linearGradient id="jl-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+C.gold+'"/><stop offset="1" stop-color="'+C.warn+'"/></linearGradient></defs></svg>'+
        '<div class="core"></div><div class="dove">'+doveSVG()+'</div>';
      r.appendChild(s);
    }
    play(dur){ clearTimeout(this._to); this.classList.remove('done'); this._to=setTimeout(()=>this.classList.add('done'), dur||1900); }
  }
  define('jvo-loader', JvoLoader);

  /* ------------------------------------------------------------- jvo-countdown
     Aftrap-teller. attrs: to="ISO of seconds" of seconds="120"; label; state.
     Bij 0 → dispatch 'jvo-countdown-done'. Pulseert onder 10s. */
  class JvoCountdown extends HTMLElement {
    connectedCallback(){ if(!this.shadowRoot) this._build(); this._start(); }
    disconnectedCallback(){ clearInterval(this._iv); }
    _build(){
      var r=attach(this);
      css(r,
        ':host{display:inline-block}'+
        '.w{display:inline-flex;flex-direction:column;align-items:center;gap:6px;background:linear-gradient(180deg,#0e1f3a,#0b1830);border:1px solid '+C.hair+';border-radius:14px;padding:14px 22px;box-shadow:0 12px 30px rgba(0,0,0,.4)}'+
        '.lb{font-family:'+C.mono+';font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:rgba(232,244,255,.5)}'+
        '.t{font-family:'+C.display+';font-weight:900;font-size:46px;line-height:1;color:'+C.gold+';font-variant-numeric:tabular-nums;letter-spacing:.02em}'+
        '.t.urgent{color:'+C.warn2+';animation:cdp 1s ease-in-out infinite}'+
        '@keyframes cdp{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}'+
        RM
      );
      this._w=document.createElement('div'); this._w.className='w';
      this._w.innerHTML='<span class="lb">'+(this.getAttribute('label')||'Aftrap over')+'</span><span class="t">--:--</span>';
      r.appendChild(this._w);
      this._t=this._w.querySelector('.t');
    }
    _start(){
      var self=this;
      var to=this.getAttribute('to'), secs=parseInt(this.getAttribute('seconds')||'0',10);
      var end = to ? (isNaN(+to)? new Date(to).getTime() : Date.now()+ (+to)*1000) : Date.now()+secs*1000;
      clearInterval(this._iv);
      function tick(){
        var rem=Math.max(0, Math.round((end-Date.now())/1000));
        var m=Math.floor(rem/60), s=rem%60;
        self._t.textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
        self._t.classList.toggle('urgent', rem<=10 && rem>0);
        if(rem<=0){ clearInterval(self._iv); self.dispatchEvent(new CustomEvent('jvo-countdown-done',{bubbles:true})); }
      }
      tick(); this._iv=setInterval(tick,1000);
    }
  }
  define('jvo-countdown', JvoCountdown);

  /* ----------------------------------------------------------------- jvo-field
     Veldstatus-kaart. attrs: field="Veld 2"; status="vrij|bezig|klaar|volgend";
     home; away; clock. Kleurt op status; 'bezig' toont live-puls. */
  class JvoField extends HTMLElement {
    static get observedAttributes(){ return ['field','status','home','away','clock']; }
    connectedCallback(){ if(!this.shadowRoot) this._build(); this._sync(); }
    attributeChangedCallback(){ if(this.shadowRoot) this._sync(); }
    _build(){
      var r=attach(this);
      css(r,
        ':host{display:block}'+
        '.f{position:relative;background:'+C.midnight2+';border:1px solid '+C.hair+';border-left:4px solid '+C.iceMut+';border-radius:14px;padding:14px 16px;transition:border-left-color .3s}'+
        '.top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}'+
        '.fn{font-family:'+C.display+';font-weight:800;font-size:20px;text-transform:uppercase;letter-spacing:.02em;color:'+C.ice+'}'+
        '.st{display:inline-flex;align-items:center;gap:7px;font-family:'+C.mono+';font-size:10px;letter-spacing:.12em;text-transform:uppercase;padding:5px 10px;border-radius:999px;border:1px solid currentColor}'+
        '.st .d{width:7px;height:7px;border-radius:50%;background:currentColor}'+
        '.st .pd{position:relative;width:9px;height:9px}'+
        '.st .pd i{position:absolute;inset:0;border-radius:50%;background:currentColor}'+
        '.st .pd b{position:absolute;inset:0;border-radius:50%;border:2px solid currentColor;animation:fp 1.8s ease-out infinite}'+
        '.mt{display:flex;align-items:center;justify-content:space-between;gap:12px}'+
        '.tm{display:flex;align-items:center;gap:8px;font-family:'+C.body+';font-size:14px;color:'+C.ice+'}'+
        '.tm .vs{font-family:'+C.mono+';font-size:10px;color:rgba(232,244,255,.4);text-transform:uppercase;letter-spacing:.1em}'+
        '.ck{font-family:'+C.mono+';font-size:13px;color:'+C.gold+';font-weight:500}'+
        '.empty{font-family:'+C.body+';font-size:13px;color:rgba(232,244,255,.5)}'+
        '@keyframes fp{0%{opacity:.7;transform:scale(.6)}70%{opacity:0;transform:scale(2.3)}100%{opacity:0}}'+
        RM
      );
      this._f=document.createElement('div'); this._f.className='f';
      r.appendChild(this._f);
    }
    _sync(){
      var g=this.getAttribute.bind(this);
      var field=g('field')||'Veld', status=g('status')||'vrij';
      var home=g('home')||'', away=g('away')||'', clk=g('clock')||'';
      var map={vrij:['Vrij',C.iceMut,false],bezig:['Bezig',C.warn2,true],klaar:['Klaar',C.clinch,false],volgend:['Volgend',C.info,false]};
      var m=map[status]||map.vrij, col=m[1];
      this._f.style.borderLeftColor=col;
      var dot = m[2] ? '<span class="pd"><i></i><b></b></span>' : '<span class="d"></span>';
      var body = (home||away)
        ? '<div class="mt"><div class="tm">'+home+' <span class="vs">vs</span> '+away+'</div>'+(clk?'<span class="ck">'+clk+'</span>':'')+'</div>'
        : '<div class="empty">Geen wedstrijd ingepland</div>';
      this._f.innerHTML='<div class="top"><span class="fn">'+field+'</span><span class="st" style="color:'+col+'">'+dot+status+'</span></div>'+body;
    }
  }
  define('jvo-field', JvoField);

  /* -------------------------------------------------------------- jvo-progress
     Ring-voortgang. attrs: value="0..100" (leeg = spinner), size="104", label. */
  class JvoProgress extends HTMLElement {
    static get observedAttributes(){ return ['value','size','label','state']; }
    connectedCallback(){ if(!this.shadowRoot) this._build(); this._sync(); }
    attributeChangedCallback(){ if(this.shadowRoot) this._sync(); }
    _build(){
      var r=attach(this);
      css(r,
        ':host{display:inline-block}'+
        '.w{position:relative;display:inline-flex;align-items:center;justify-content:center}'+
        '.track{stroke:#16294a}'+
        '.bar{stroke:url(#jp-g);stroke-linecap:round;transition:stroke-dashoffset .5s cubic-bezier(.16,1,.3,1)}'+
        '.bar.spin{animation:sp 1.15s linear infinite;transform-origin:50% 50%}'+
        '.lb{position:absolute;font-family:'+C.mono+';font-weight:500;color:'+C.gold+';font-variant-numeric:tabular-nums}'+
        '.mk{position:absolute;color:'+C.info+';display:flex}'+
        '@keyframes sp{to{transform:rotate(360deg)}}'+
        RM
      );
      this._w=document.createElement('div'); this._w.className='w';
      r.appendChild(this._w);
    }
    _sync(){
      var size=parseFloat(this.getAttribute('size')||'104');
      var val=this.getAttribute('value'), label=this.getAttribute('label');
      var rad=(size-16)/2, circ=2*Math.PI*rad, cx=size/2;
      var has = val!==null && val!=='';
      var off = has ? circ*(1-Math.min(100,Math.max(0,parseFloat(val)))/100) : circ*0.28;
      var lbHTML = has ? '<span class="lb" style="font-size:'+(size*0.2)+'px">'+Math.round(parseFloat(val))+'</span>'
                       : '<span class="mk" style="width:'+(size*0.32)+'px">'+doveSVG()+'</span>';
      this._w.style.width=size+'px'; this._w.style.height=size+'px';
      this._w.innerHTML='<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">'+
        '<defs><linearGradient id="jp-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+C.gold+'"/><stop offset="1" stop-color="'+C.warn+'"/></linearGradient></defs>'+
        '<circle class="track" cx="'+cx+'" cy="'+cx+'" r="'+rad+'" fill="none" stroke-width="8"/>'+
        '<circle class="bar'+(has?'':' spin')+'" cx="'+cx+'" cy="'+cx+'" r="'+rad+'" fill="none" stroke-width="8" '+
          'transform="rotate(-90 '+cx+' '+cx+')" stroke-dasharray="'+circ+'" stroke-dashoffset="'+off+'"/>'+
        '</svg>'+lbHTML;
      var mk=this._w.querySelector('.mk svg'); if(mk){mk.style.width='100%';mk.style.height='auto';}
    }
  }
  define('jvo-progress', JvoProgress);

  /* ----------------------------------------------------------------- jvo-empty
     Lege staat met rustende duif. attrs: title; hint; state. slot = extra. */
  class JvoEmpty extends HTMLElement {
    connectedCallback(){
      var r=attach(this);
      var state=this.getAttribute('state')||'neutral', col=sev(state);
      var title=this.getAttribute('title')||'Nog niets hier';
      var hint=this.getAttribute('hint')||'';
      css(r,
        ':host{display:block}'+
        '.e{display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;padding:40px 24px}'+
        '.mk{width:78px;height:78px;border-radius:50%;background:'+C.midnight3+';display:flex;align-items:center;justify-content:center;color:'+col+';animation:eb 3.6s ease-in-out infinite}'+
        '.mk svg{width:48px;height:auto;transform-origin:50% 62%}'+
        '.tt{font-family:'+C.display+';font-weight:800;font-size:24px;text-transform:uppercase;letter-spacing:.01em;color:'+C.ice+'}'+
        '.ht{font-family:'+C.body+';font-size:14px;line-height:1.5;color:rgba(232,244,255,.6);max-width:34ch;font-weight:300}'+
        '@keyframes eb{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-6%) scale(1.02)}}'+
        RM
      );
      var e=document.createElement('div'); e.className='e';
      e.innerHTML='<span class="mk">'+doveSVG()+'</span><div class="tt">'+title+'</div>'+(hint?'<div class="ht">'+hint+'</div>':'')+'<slot></slot>';
      r.appendChild(e);
    }
  }
  define('jvo-empty', JvoEmpty);

  /* ------------------------------------------------------------- jvo-standings
     Ranglijst-rij. attrs: pos; team; played; points; highlight; delta="up|down". */
  class JvoStandings extends HTMLElement {
    static get observedAttributes(){ return ['pos','team','played','points','highlight','delta']; }
    connectedCallback(){ if(!this.shadowRoot) this._build(); this._sync(); }
    attributeChangedCallback(){ if(this.shadowRoot) this._sync(); }
    _build(){
      var r=attach(this);
      css(r,
        ':host{display:block}'+
        '.row{display:grid;grid-template-columns:34px 1fr auto auto;align-items:center;gap:14px;padding:11px 14px;border-radius:10px;'+
          'background:'+C.midnight2+';border:1px solid '+C.hair+';transition:background .4s,border-color .4s}'+
        '.row.hl{background:rgba(255,205,122,.1);border-color:rgba(255,205,122,.4)}'+
        '.pos{font-family:'+C.display+';font-weight:900;font-size:20px;color:rgba(232,244,255,.5);text-align:center}'+
        '.row.hl .pos{color:'+C.gold+'}'+
        '.tm{display:flex;align-items:center;gap:8px;font-family:'+C.body+';font-size:14px;font-weight:500;color:'+C.ice+'}'+
        '.dl{font-size:10px}'+
        '.pl{font-family:'+C.mono+';font-size:12px;color:rgba(232,244,255,.5)}'+
        '.pt{font-family:'+C.display+';font-weight:900;font-size:22px;color:'+C.gold+';min-width:30px;text-align:right}'+
        RM
      );
      this._row=document.createElement('div'); this._row.className='row';
      r.appendChild(this._row);
    }
    _sync(){
      var g=this.getAttribute.bind(this);
      var hl=this.hasAttribute('highlight');
      var delta=g('delta'), dl = delta==='up'?'<span class="dl" style="color:'+C.clinch+'">▲</span>':delta==='down'?'<span class="dl" style="color:'+C.warn+'">▼</span>':'';
      this._row.className='row'+(hl?' hl':'');
      this._row.innerHTML='<span class="pos">'+(g('pos')||'')+'</span>'+
        '<span class="tm">'+dl+(g('team')||'')+'</span>'+
        '<span class="pl">'+(g('played')||'0')+'w</span>'+
        '<span class="pt">'+(g('points')||'0')+'</span>';
    }
  }
  define('jvo-standings', JvoStandings);

  /* ---------------------------------------------------------------- jvo-qrscan
     Check-in scanner-frame met scanlijn; .ok() flasht groen + 'jvo-scan-ok'. */
  class JvoQrscan extends HTMLElement {
    connectedCallback(){ if(!this.shadowRoot) this._build(); }
    _build(){
      var r=attach(this);
      var size=parseFloat(this.getAttribute('size')||'120');
      css(r,
        ':host{display:inline-block}'+
        '.q{position:relative;color:'+C.turq+'}'+
        '.q svg{display:block}'+
        '.line{position:absolute;left:14%;right:14%;top:22%;height:2px;border-radius:2px;background:'+C.turq+';box-shadow:0 0 10px '+C.turq+';animation:qs 2.4s ease-in-out infinite}'+
        '.ok{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0}'+
        '.ok.on{animation:qok 1.2s ease}'+
        '.ok svg{width:44%;height:auto}'+
        '@keyframes qs{0%{transform:translateY(-8px);opacity:0}12%{opacity:1}50%{transform:translateY('+(size*0.52)+'px)}88%{opacity:1}100%{transform:translateY(-8px);opacity:0}}'+
        '@keyframes qok{0%{opacity:0;transform:scale(.6)}30%{opacity:1;transform:scale(1.1)}45%{transform:scale(1)}80%{opacity:1}100%{opacity:0}}'+
        RM
      );
      this._q=document.createElement('div'); this._q.className='q';
      this._q.innerHTML='<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+
        '<path d="M4 8 V5 a1 1 0 0 1 1-1 h3 M16 4 h3 a1 1 0 0 1 1 1 v3 M20 16 v3 a1 1 0 0 1-1 1 h-3 M8 20 H5 a1 1 0 0 1-1-1 v-3"/></svg>'+
        '<span class="line"></span>'+
        '<span class="ok"><svg viewBox="0 0 24 24" fill="none" stroke="'+C.clinch+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 L9 17 L4 12"/></svg></span>';
      r.appendChild(this._q);
    }
    ok(){
      var el=this._q.querySelector('.ok'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
      this.dispatchEvent(new CustomEvent('jvo-scan-ok',{bubbles:true}));
    }
  }
  define('jvo-qrscan', JvoQrscan);
})();
