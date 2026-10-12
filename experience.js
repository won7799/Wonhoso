(() => {
  'use strict';
  const root=document.documentElement;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const fine=matchMedia('(hover: hover) and (pointer: fine)');
  const $=(selector,scope=document)=>scope.querySelector(selector);
  const $$=(selector,scope=document)=>[...scope.querySelectorAll(selector)];
  const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
  const revealSelector='.introduction h2, .section-heading h2, .artist-work, .excerpts-heading, .excerpt-card, .official-stories, .mallow-copy, .news-copy, #contact-title, .contact-bottom';
  const scenes=$$('.world-section,.mallow-section');
  const revealTargets=new Set();
  let observer=null;
  let frame=0;
  let scrollDirty=true;
  let pointerVisible=false;
  let pointerX=innerWidth*.5;
  let pointerY=innerHeight*.5;
  let targetX=pointerX;
  let targetY=pointerY;
  let lastTime=0;
  let destroyed=false;
  const progress=document.createElement('div');progress.className='reading-progress';progress.setAttribute('aria-hidden','true');document.body.append(progress);
  const aura=document.createElement('div');aura.className='pointer-aura';aura.setAttribute('aria-hidden','true');aura.innerHTML='<span class="pointer-aura-core"></span>';document.body.append(aura);
  const decorations=[];
  scenes.forEach((scene,index)=>{
    const atmosphere=document.createElement('div');atmosphere.className='scene-atmosphere';atmosphere.setAttribute('aria-hidden','true');
    const light=document.createElement('div');light.className='scene-light';atmosphere.append(light);
    const arc=document.createElement('div');arc.className='scene-arc';atmosphere.append(arc);
    for(let i=0;i<10;i++){
      const mote=document.createElement('i');mote.className='scene-mote';
      mote.style.setProperty('--mote-x',`${(13+i*19+index*7)%94}%`);
      mote.style.setProperty('--mote-y',`${(9+i*23)%89}%`);
      mote.style.setProperty('--mote-size',`${i%3===0?4:2}px`);
      mote.style.setProperty('--mote-depth',String(.35+(i%4)*.23));
      atmosphere.append(mote);
    }
    scene.prepend(atmosphere);decorations.push(atmosphere);
  });
  function reveal(node){node.classList.add('is-revealed');observer?.unobserve(node);}
  function prepareReveals(){
    revealTargets.forEach(node=>{if(!node.isConnected){observer?.unobserve(node);revealTargets.delete(node);}});
    if(reduced.matches||!('IntersectionObserver' in window)){
      revealTargets.forEach(reveal);return;
    }
    if(!observer)observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting)reveal(entry.target);});},{threshold:.08,rootMargin:'0px 0px -7% 0px'});
    $$(revealSelector).forEach((node,index)=>{
      if(revealTargets.has(node))return;
      revealTargets.add(node);
      node.style.setProperty('--reveal-delay',`${node.classList.contains('artist-work')?(index%3)*75:0}ms`);
      // Content already reached stays visible, including restored scroll positions.
      if(node.getBoundingClientRect().top<innerHeight*.87){node.classList.add('is-revealed');return;}
      observer.observe(node);node.classList.add('reveal-prepared');
    });
  }
  function paint(now){
    frame=0;if(destroyed||document.hidden)return;
    const dt=lastTime?Math.min(.05,(now-lastTime)/1000):.016;lastTime=now;
    const ease=1-Math.exp(-13*dt);
    pointerX+=(targetX-pointerX)*ease;pointerY+=(targetY-pointerY)*ease;
    const dx=(pointerX/Math.max(1,innerWidth)-.5)*2;
    const dy=(pointerY/Math.max(1,innerHeight)-.5)*2;
    if(fine.matches&&!reduced.matches&&pointerVisible){
      aura.style.transform=`translate3d(${pointerX.toFixed(2)}px,${pointerY.toFixed(2)}px,0)`;
      aura.classList.add('is-visible');
    }else aura.classList.remove('is-visible');
    if(scrollDirty){
      const height=Math.max(1,root.scrollHeight-innerHeight);
      progress.style.transform=`scaleX(${clamp(scrollY/height).toFixed(5)})`;
    }
    if(!reduced.matches){
      scenes.forEach(scene=>{
        const rect=scene.getBoundingClientRect();
        if(rect.bottom<0||rect.top>innerHeight)return;
        const travel=clamp((innerHeight-rect.top)/(innerHeight+rect.height))*2-1;
        const range=innerWidth<=760?28:66;
        scene.style.setProperty('--scene-scroll',`${(travel*range).toFixed(2)}px`);
        scene.style.setProperty('--scene-x',`${(fine.matches?dx*23:0).toFixed(2)}px`);
        scene.style.setProperty('--scene-y',`${(fine.matches?dy*19:0).toFixed(2)}px`);
        if(scene.classList.contains('world-section')){
          const entry=clamp((innerHeight-rect.top)/(innerHeight*.7));
          scene.style.setProperty('--scene-inset',`${((1-entry)*(innerWidth<=760?3:5)).toFixed(2)}%`);
        }
      });
    }
    scrollDirty=false;
    if(Math.abs(targetX-pointerX)+Math.abs(targetY-pointerY)>.3&&!reduced.matches&&fine.matches)queue();
    else lastTime=0;
  }
  function queue(){if(!frame&&!destroyed&&!document.hidden)frame=requestAnimationFrame(paint);}
  function onScroll(){scrollDirty=true;queue();}
  function onPointer(event){
    if(event.pointerType!=='mouse'||!fine.matches||reduced.matches)return;
    pointerVisible=true;targetX=event.clientX;targetY=event.clientY;
    aura.classList.toggle('over-image',!!event.target.closest('.artist-portrait,.work-cover,.excerpt-poster,.mallow-image,.news-image'));
    queue();
  }
  function resetVisuals(){
    root.classList.toggle('has-experience',!reduced.matches);
    aura.classList.remove('is-visible');
    if(reduced.matches){
      if(frame)cancelAnimationFrame(frame);frame=0;
      revealTargets.forEach(reveal);
      scenes.forEach(scene=>['--scene-scroll','--scene-x','--scene-y','--scene-inset'].forEach(key=>scene.style.removeProperty(key)));
    }
    prepareReveals();scrollDirty=true;queue();
  }
  function onFocus(event){const target=event.target.closest('.reveal-prepared');if(target)reveal(target);}
  function onLeave(event){if(!event.relatedTarget){pointerVisible=false;aura.classList.remove('is-visible');}}
  function onHidden(){
    if(document.hidden){if(frame)cancelAnimationFrame(frame);frame=0;lastTime=0;pointerVisible=false;aura.classList.remove('is-visible');}
    else{scrollDirty=true;queue();}
  }
  function refresh(){prepareReveals();scrollDirty=true;queue();}
  addEventListener('scroll',onScroll,{passive:true});
  addEventListener('resize',refresh,{passive:true});
  document.addEventListener('pointermove',onPointer,{passive:true});
  document.addEventListener('pointerout',onLeave,{passive:true});
  document.addEventListener('focusin',onFocus);
  document.addEventListener('visibilitychange',onHidden);
  document.addEventListener('etherial:content-updated',refresh);
  reduced.addEventListener('change',resetVisuals);fine.addEventListener('change',resetVisuals);
  resetVisuals();
  window.ETHERIAL_EXPERIENCE={refresh,destroy(){
    destroyed=true;if(frame)cancelAnimationFrame(frame);observer?.disconnect();
    removeEventListener('scroll',onScroll);removeEventListener('resize',refresh);
    document.removeEventListener('pointermove',onPointer);document.removeEventListener('pointerout',onLeave);document.removeEventListener('focusin',onFocus);document.removeEventListener('visibilitychange',onHidden);document.removeEventListener('etherial:content-updated',refresh);
    reduced.removeEventListener('change',resetVisuals);fine.removeEventListener('change',resetVisuals);
    revealTargets.forEach(node=>{node.classList.remove('reveal-prepared');node.classList.add('is-revealed');});
    decorations.forEach(node=>node.remove());progress.remove();aura.remove();root.classList.remove('has-experience');
  }};
})();
