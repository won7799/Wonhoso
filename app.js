(() => {
  'use strict';
  const content = window.ETHERIAL_CONTENT;
  if (!content) return;
  const $ = (s, scope = document) => scope.querySelector(s);
  const $$ = (s, scope = document) => [...scope.querySelectorAll(s)];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobileMedia = matchMedia('(max-width: 760px)');
  const track = $('#artist-track');
  const profileDialog = $('#artist-dialog');
  const mediaDialog = $('#media-dialog');
  const hero = $('#hero-video');
  const motionButton = $('#motion-toggle');
  let language = 'en';
  let activeArtist = null;
  let lastFocus = null;
  let menuLastFocus = null;
  let heroRequested = false;
  let heroInView = true;
  let lastHeroPermission = false;
  const tr = value => typeof value === 'object' ? (value[language] || value.en) : value;
  const text = (node, value) => { node.textContent = tr(value); return node; };
  const el = (tag, classes, value) => { const node = document.createElement(tag); if (classes) node.className = classes; if (value != null) text(node, value); return node; };
  const externalLink = (label, url, classes) => { const link = el('a', classes, label); link.href=url;link.target='_blank';link.rel='noopener noreferrer';return link; };
  function normalizeArrows(scope=document.body){
    const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT,{acceptNode:node=>node.nodeValue.includes('↗')&&!node.parentElement.closest('script,style,svg')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{const parts=node.nodeValue.split('↗');const fragment=document.createDocumentFragment();parts.forEach((part,index)=>{fragment.append(document.createTextNode(part));if(index<parts.length-1){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 16 16');svg.setAttribute('class','arrow-icon');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M3 13 13 3M3 3h10v10');svg.append(path);fragment.append(svg);}});node.replaceWith(fragment);});
  }
  function renderArtists() {
    document.dispatchEvent(new Event('etherial:before-render'));
    track.replaceChildren();
    content.artists.forEach((artist,index) => {
      const card=el('button','artist-card');card.type='button';card.dataset.artist=artist.id;card.setAttribute('aria-label',`${language==='ko'?'프로필 보기:':'View profile:'} ${artist.name}`);
      const portrait=el('div','artist-portrait');const image=el('img');image.src=artist.image;image.alt=artist.name;image.loading='lazy';image.width=900;image.height=1125;image.style.objectPosition=artist.position;portrait.append(image,el('span','artist-index',`0${index+1} / ETHERIAL`),el('span','artist-profile-arrow','↗'));portrait.lastChild.setAttribute('aria-hidden','true');
      const meta=el('div','artist-meta');meta.append(el('span','artist-type',artist.type),el('h3','',artist.name),el('p','artist-profession',artist.profession),el('p','artist-discipline',artist.discipline));card.append(portrait,meta);track.append(card);
    });
    requestAnimationFrame(()=>{setupArtistGallery();updateGallery();});
  }
  function workAction(item,label,classes) {
    const node=item.media?el('button',classes,label):externalLink(label,item.url,classes);
    if(item.media){node.type='button';node.dataset.media=item.media;}
    return node;
  }
  function renderHighlights() {
    const grid=$('#artist-works');if(!grid)return;grid.replaceChildren();
    content.highlights.forEach(item=>{
      const artist=content.artists.find(a=>a.id===item.artist);if(!artist)return;
      const card=el('article','artist-work');card.dataset.workArtist=artist.id;
      const cover=workAction(item,'','work-cover');cover.setAttribute('aria-label',`${language==='ko'?'보기:':'Watch:'} ${artist.name} — ${tr(item.title)}`);
      const img=el('img');img.src=item.poster||artist.image;img.alt=artist.name;img.loading='lazy';img.width=900;img.height=1125;img.style.objectPosition=item.position||artist.position;
      const icon=el('span','work-play',item.media?'▷':'↗');icon.setAttribute('aria-hidden','true');cover.append(img,icon);
      const copy=el('div','work-copy');copy.append(el('p','micro',tr(item.kind)),el('h3','',artist.name),el('p','work-title',item.title));
      const actions=el('div','work-actions');actions.append(workAction(item,{en:item.media?'Watch the film ↗':'Watch on Instagram ↗',ko:item.media?'영상 보기 ↗':'Instagram에서 보기 ↗'},'work-text-link'));
      if(item.secondary){actions.append(workAction(item.secondary,tr(item.secondary.label)+' ↗','work-text-link'));}
      else{const profile=el('button','work-text-link',{en:'Artist profile ↗',ko:'아티스트 프로필 ↗'});profile.type='button';profile.dataset.artist=artist.id;actions.append(profile);}
      copy.append(actions);card.append(cover,copy);grid.append(card);
    });
    const ensemble=el('article','artist-work ensemble-work');const cover=el('button','work-cover ensemble-cover');cover.type='button';cover.dataset.media='strictly';cover.setAttribute('aria-label',language==='ko'?'STRICTLY BUSINESS 앙상블 필름 보기':'Watch STRICTLY BUSINESS, the ensemble film');
    const line=el('div','ensemble-lineup');content.artists.forEach(a=>{const img=el('img');img.src=a.image;img.alt=a.name;img.loading='lazy';img.style.objectPosition=a.position;line.append(img);});cover.append(line,el('span','work-play','▷'));
    const copy=el('div','work-copy');copy.append(el('p','micro',{en:'Etherial Agency × Vigloo Studio',ko:'Etherial Agency × Vigloo Studio'}),el('h3','ensemble-title','STRICTLY BUSINESS'),el('p','work-title',{en:'Five artists. One ensemble film.',ko:'다섯 아티스트가 함께한 하나의 필름.'}));const actions=el('div','work-actions');actions.append(workAction({media:'strictly'},{en:'Watch the full film ↗',ko:'전체 필름 보기 ↗'},'work-text-link'));copy.append(actions);ensemble.append(cover,copy);grid.append(ensemble);
  }
  function renderExcerpts() {
    const grid=$('#excerpt-grid');if(!grid)return;grid.replaceChildren();
    (content.excerpts||[]).forEach(item=>{
      const artist=content.artists.find(a=>a.id===item.artist);if(!artist)return;
      const card=el('article','excerpt-card');card.dataset.excerptArtist=artist.id;
      const cover=el('button','excerpt-poster');cover.type='button';cover.dataset.media=item.media;cover.setAttribute('aria-label',`${language==='ko'?'재생:':'Play:'} ${artist.name} — ${tr(item.title)}`);
      const image=el('img');image.src=item.poster;image.alt=artist.name+' — '+tr(item.title);image.loading='lazy';image.width=720;image.height=1280;const icon=el('span','excerpt-play','▷');icon.setAttribute('aria-hidden','true');cover.append(image,icon,el('span','excerpt-duration',item.duration));
      const body=el('div','excerpt-copy');body.append(el('p','micro',item.title),el('h4','',artist.name),el('p','excerpt-description',item.description));const play=workAction({media:item.media},{en:'Play excerpt ↗',ko:'클립 재생 ↗'},'excerpt-link');body.append(play);const profile=el('button','excerpt-profile',{en:'Artist profile ↗',ko:'아티스트 프로필 ↗'});profile.type='button';profile.dataset.artist=artist.id;body.append(profile);card.append(cover,body);grid.append(card);
    });
  }
  function setLanguage(lang) {
    language=lang==='ko'?'ko':'en';document.documentElement.lang=language;
    $$('[data-en][data-ko]').forEach(node => {node.textContent=node.dataset[language].replace(/\\n/g,'\n');});
    $$('[data-language]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.language===language)));
    $('#artists-prev').setAttribute('aria-label',language==='ko'?'이전 아티스트':'Previous artists');$('#artists-next').setAttribute('aria-label',language==='ko'?'다음 아티스트':'Next artists');
    renderArtists();renderHighlights();renderExcerpts();if(activeArtist && profileDialog.open) renderProfile(activeArtist);updateMotionLabel();normalizeArrows();updateGalleryLabel();document.dispatchEvent(new Event('etherial:content-updated'));
  }
  $$('[data-language]').forEach(button=>button.addEventListener('click',()=>setLanguage(button.dataset.language)));
  function updateGallery(){const scrollable=track.scrollWidth>track.clientWidth+2;$('#artists-prev').disabled=!scrollable;$('#artists-next').disabled=!scrollable;}
  function moveGallery(direction){navigateGallery(direction);}
  $('#artists-prev').addEventListener('click',()=>moveGallery(-1));$('#artists-next').addEventListener('click',()=>moveGallery(1));
  const menu=$('#mobile-nav');const menuButton=$('.menu-toggle');
  function setMenu(open){if(open){menuLastFocus=document.activeElement;}menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Close menu':'Open menu');menu.hidden=!open;menu.inert=!open;document.body.classList.toggle('menu-open',open);if(open){$('a',menu).focus();}else if(menuLastFocus){menuLastFocus.focus({preventScroll:true});}}
  menuButton.addEventListener('click',()=>setMenu(menuButton.getAttribute('aria-expanded')!=='true'));
  $$('a',menu).forEach(link=>link.addEventListener('click',()=>setMenu(false)));
  matchMedia('(min-width:901px)').addEventListener('change',event=>{if(event.matches && !menu.hidden)setMenu(false);});
  function openDialog(dialog){lastFocus=document.activeElement;dialog.showModal();document.body.classList.add('dialog-open');$('.dialog-close',dialog).focus();}
  function closeDialog(dialog){if(dialog.open)dialog.close();}
  function cleanupMedia(){const video=$('video',$('#media-container'));if(video)video.pause();$('#media-container').replaceChildren();}
  [profileDialog,mediaDialog].forEach(dialog=>{
    $('.dialog-close',dialog).addEventListener('click',()=>closeDialog(dialog));
    dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeDialog(dialog);}});
    dialog.addEventListener('close',()=>{if(dialog===mediaDialog)cleanupMedia();if(!profileDialog.open&&!mediaDialog.open)document.body.classList.remove('dialog-open');if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});});
  });
  function renderProfile(artist){
    const layout=el('div','profile-layout');const img=el('img','profile-image');img.src=artist.image;img.alt=artist.name;img.style.objectPosition=artist.position;img.width=900;img.height=1125;
    const body=el('div','profile-content');body.append(el('p','eyebrow',artist.type));const heading=el('h2','',artist.name);heading.id='profile-name';body.append(heading);if(artist.profession)body.append(el('p','profile-profession',artist.profession));if(artist.identity && artist.identity!==artist.type.en)body.append(el('span','profile-identity',artist.identity));body.append(el('p','profile-description',artist.description));
    const links=el('div','profile-links');artist.links.forEach(([label,url])=>links.append(externalLink(label+' ↗',url)));body.append(links);
    if(artist.works.length){const works=el('div','profile-works');works.append(el('p','micro',{en:'Music & moving images',ko:'음악 & 영상'}));artist.works.forEach(work=>{if(work.media){const button=el('button','',tr(work.label)+' ↗');button.type='button';button.addEventListener('click',()=>{closeDialog(profileDialog);openMedia(work.media);});works.append(button);}else if(work.youtube){const button=el('button','',tr(work.label)+' ↗');button.type='button';button.addEventListener('click',()=>{closeDialog(profileDialog);openMedia({title:tr(work.label),subtitle:artist.name,youtube:work.youtube,url:work.url,portrait:work.portrait});});works.append(button);}else{works.append(externalLink(tr(work.label)+' ↗',work.url));}});body.append(works);}
    layout.append(img,body);const container=$('#artist-dialog-content');container.replaceChildren(layout);if(artist.editorial?.length){const gallery=el('section','profile-editorial');gallery.setAttribute('aria-label',language==='ko'?'추가 포트레이트':'Additional portraits');artist.editorial.forEach(item=>{const figure=el('figure');const image=el('img');image.src=item.image;image.alt=artist.name+' — '+tr(item.caption);image.loading='lazy';figure.append(image,el('figcaption','micro',item.caption));gallery.append(figure);});container.append(gallery);}
    normalizeArrows(container);
  }
  function openProfile(id){const artist=content.artists.find(item=>item.id===id);if(!artist)return;activeArtist=artist;pauseGalleryByUser();renderProfile(artist);openDialog(profileDialog);}
  function openMedia(item){
    const media=typeof item==='string'?content.media[item]:item;if(!media)return;
    text($('#media-title'),media.title);text($('#media-subtitle'),media.subtitle);const container=$('#media-container');container.replaceChildren();$('#media-note').replaceChildren();
    if(media.youtube){
      const consent=el('div','youtube-consent');const load=el('button','button light',{en:'▶ Play on this page',ko:'▶ 이 페이지에서 재생'});load.type='button';
      const note=el('p','',{en:'This video is hosted on YouTube. Playing it loads YouTube’s embedded player and shares your connection information with YouTube.',ko:'YouTube에서 제공하는 영상입니다. 재생하면 YouTube 플레이어가 로드되며 연결 정보가 YouTube에 전달됩니다.'});
      load.addEventListener('click',()=>{const frame=el('iframe',media.portrait?'portrait-embed':'');frame.src=`https://www.youtube-nocookie.com/embed/${encodeURIComponent(media.youtube)}?autoplay=1&rel=0`;frame.title=tr(media.title);frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.referrerPolicy='strict-origin-when-cross-origin';frame.allowFullscreen=true;container.replaceChildren(frame);frame.focus();});
      consent.append(load,note);container.append(consent);$('#media-note').append(externalLink(language==='ko'?'YouTube에서 직접 보기 ↗':'Open directly on YouTube ↗',media.url));
    }else{
      const video=el('video',(media.portrait||media.file.includes('proof-'))?'portrait-video':'');video.controls=true;video.playsInline=true;video.preload='metadata';video.poster=media.poster;video.src=media.file;video.setAttribute('aria-label',tr(media.title));
      const fallback=el('p','',language==='ko'?'브라우저에서 영상을 지원하지 않습니다.':'Your browser does not support this video.');fallback.append(externalLink(language==='ko'?'영상 열기':'Open video',media.file));video.append(fallback);
      video.addEventListener('error',()=>{const error=el('p','video-error',language==='ko'?'영상을 불러오지 못했습니다. 아래 링크로 열어주세요.':'The video could not be loaded. Please open the video file below.');container.append(error);},{once:true});container.append(video);
      $('#media-note').append(document.createTextNode(language==='ko'?'재생 버튼으로 시작하세요. ':'Press play to begin. '),externalLink(language==='ko'?'영상 파일 열기 ↗':'Open video file ↗',media.file));
    }
    normalizeArrows(mediaDialog);openDialog(mediaDialog);hero.pause();
  }
  document.addEventListener('click',event=>{const artistTrigger=event.target.closest('[data-artist]');if(artistTrigger){openProfile(artistTrigger.dataset.artist);return;}const mediaTrigger=event.target.closest('[data-media]');if(mediaTrigger)openMedia(mediaTrigger.dataset.media);});
  document.addEventListener('keydown',event=>{
    if(!menu.hidden){if(event.key==='Escape'){event.preventDefault();setMenu(false);}if(event.key==='Tab'){const focusable=[menuButton,...$$('a',menu)];const index=focusable.indexOf(document.activeElement);if(event.shiftKey&&index<=0){event.preventDefault();focusable.at(-1).focus();}else if(!event.shiftKey&&index===focusable.length-1){event.preventDefault();menuButton.focus();}}}
  });
  function updateMotionLabel(){const label=$('.motion-label',motionButton);const isPlaying=!hero.paused;text(label,isPlaying?{en:'Pause motion',ko:'영상 일시정지'}:{en:'Play motion',ko:'영상 재생'});$('.motion-icon',motionButton).textContent='';$('.motion-icon',motionButton).classList.toggle('is-playing',isPlaying);motionButton.setAttribute('aria-label',tr(isPlaying?{en:'Pause background motion',ko:'배경 영상 일시정지'}:{en:'Play background motion',ko:'배경 영상 재생'}));motionButton.setAttribute('aria-pressed',String(isPlaying));}
  async function playHero(userInitiated=false){if(!content.heroVideo)return;if(userInitiated){lastHeroPermission=true;hero.classList.add('user-play');}if(!heroRequested){hero.src=content.heroVideo;heroRequested=true;hero.load();}try{await hero.play();}catch{updateMotionLabel();}}
  if(content.heroVideo){motionButton.hidden=false;hero.poster='assets/hero-studio.webp';hero.addEventListener('loadeddata',()=>hero.classList.add('is-ready'));hero.addEventListener('play',updateMotionLabel);hero.addEventListener('pause',updateMotionLabel);hero.addEventListener('error',()=>{hero.classList.remove('is-ready');motionButton.hidden=true;});if(!reducedMotion.matches&&!navigator.connection?.saveData){lastHeroPermission=true;playHero();}}
  motionButton.addEventListener('click',()=>{if(hero.paused)playHero(true);else{lastHeroPermission=false;hero.pause();}});
  if('IntersectionObserver' in window){new IntersectionObserver(entries=>{heroInView=entries[0].isIntersecting;if(!heroInView)hero.pause();else if(lastHeroPermission&&!document.hidden&&!mediaDialog.open)playHero();},{threshold:.05}).observe($('.hero'));}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)hero.pause();else if(lastHeroPermission&&heroInView&&!mediaDialog.open)playHero();});
  mediaDialog.addEventListener('close',()=>{if(lastHeroPermission&&heroInView&&!document.hidden)playHero();});
  reducedMotion.addEventListener('change',event=>{if(event.matches){lastHeroPermission=false;hero.pause();hero.classList.remove('user-play');}});

  // Native scrolling keeps the portraits sharp and the drag/swipe interaction
  // familiar. A decorative second run makes the wrap visually continuous.
  const galleryButton=$('#gallery-toggle');
  const galleryStatus=$('#gallery-status');
  let galleryWantsPlay=!reducedMotion.matches;
  let galleryHover=false;
  let galleryFocused=false;
  let galleryPointer=false;
  let galleryInView=false;
  let galleryFrame=0;
  let galleryLastTime=0;
  let galleryPosition=0;
  let galleryCycle=0;
  let galleryStep=0;
  let galleryNavigating=false;
  let galleryNavigationTimer=0;
  let galleryDrag=null;
  let suppressGalleryClick=false;
  const galleryCanMove=()=>galleryWantsPlay&&!galleryHover&&!galleryFocused&&!galleryPointer&&galleryInView&&!document.hidden&&!profileDialog.open&&!mediaDialog.open&&galleryCycle>0;
  function updateGalleryLabel(){
    if(!galleryButton)return;
    text($('.gallery-toggle-label',galleryButton),galleryWantsPlay?{en:'Pause gallery',ko:'갤러리 일시정지'}:{en:'Play gallery',ko:'갤러리 재생'});
    galleryButton.setAttribute('aria-pressed',String(galleryWantsPlay));
    $('.motion-icon',galleryButton).classList.toggle('is-playing',galleryWantsPlay);
    text(galleryStatus,!galleryWantsPlay?{en:'Paused · Explore at your pace',ko:'일시정지 · 원하는 속도로 둘러보세요'}:galleryCanMove()?{en:'Gallery moving',ko:'갤러리 재생 중'}:{en:'Paused while you explore',ko:'둘러보는 동안 잠시 멈춥니다'});
  }
  function normalizeGalleryPosition(){
    if(!galleryCycle)return;
    if(track.scrollLeft>=galleryCycle)track.scrollLeft-=galleryCycle;
    galleryPosition=track.scrollLeft;
  }
  function galleryTick(now){
    galleryFrame=0;
    if(!galleryCanMove()){galleryLastTime=0;updateGalleryLabel();return;}
    const elapsed=galleryLastTime?Math.min(64,now-galleryLastTime):0;
    galleryLastTime=now;
    galleryPosition+=(window.innerWidth<=760?23:34)*elapsed/1000;
    if(galleryPosition>=galleryCycle)galleryPosition-=galleryCycle;
    track.scrollLeft=galleryPosition;
    galleryFrame=requestAnimationFrame(galleryTick);
  }
  function reconcileGallery(){
    const moving=galleryCanMove();
    if(!moving&&galleryFrame){cancelAnimationFrame(galleryFrame);galleryFrame=0;galleryLastTime=0;}
    if(moving&&!galleryFrame){galleryPosition=track.scrollLeft;galleryLastTime=0;galleryFrame=requestAnimationFrame(galleryTick);}
    updateGalleryLabel();
  }
  function pauseGalleryByUser(){galleryWantsPlay=false;reconcileGallery();}
  function measureGallery(){
    const originals=$$('.artist-card:not(.gallery-copy)',track);
    const first=originals[0];const duplicate=$('.gallery-copy',track);
    if(!first||!duplicate)return;
    galleryStep=(originals[1]?.offsetLeft||0)-first.offsetLeft;
    galleryCycle=duplicate.offsetLeft-first.offsetLeft;
    if(galleryCycle<=track.clientWidth)galleryCycle=0;
    normalizeGalleryPosition();updateGallery();reconcileGallery();
  }
  function setupArtistGallery(){
    const originals=$$('.artist-card:not(.gallery-copy)',track);
    $$('.gallery-copy',track).forEach(copy=>copy.remove());
    originals.forEach(card=>{
      const copy=el('div','artist-card gallery-copy');copy.dataset.artist=card.dataset.artist;
      copy.setAttribute('aria-hidden','true');
      [...card.childNodes].forEach(child=>copy.append(child.cloneNode(true)));
      $$('img',copy).forEach(image=>image.alt='');
      track.append(copy);
    });
    // Only the five real buttons participate in the keyboard/accessibility tree.
    // Pointer activation on an identical decorative copy opens the same profile.
    track.scrollLeft=0;galleryPosition=0;
    const rect=track.getBoundingClientRect();galleryInView=rect.bottom>0&&rect.top<window.innerHeight;
    normalizeArrows(track);measureGallery();document.dispatchEvent(new Event('etherial:gallery-ready'));
  }
  function finishGalleryNavigation(){
    if(!galleryNavigating)return;
    galleryNavigating=false;clearTimeout(galleryNavigationTimer);normalizeGalleryPosition();
  }
  function navigateGallery(direction){
    if(!galleryCycle)return;
    pauseGalleryByUser();finishGalleryNavigation();
    if(direction<0&&track.scrollLeft<galleryStep){track.scrollLeft+=galleryCycle;}
    galleryNavigating=true;
    track.scrollBy({left:direction*galleryStep,behavior:reducedMotion.matches?'instant':'smooth'});
    galleryNavigationTimer=setTimeout(finishGalleryNavigation,600);
  }
  galleryButton.addEventListener('click',()=>{
    galleryWantsPlay=!galleryWantsPlay;
    if(galleryWantsPlay){finishGalleryNavigation();normalizeGalleryPosition();}
    reconcileGallery();
  });
  track.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){galleryHover=true;reconcileGallery();}});
  track.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse'){galleryHover=false;reconcileGallery();}});
  track.addEventListener('focusin',()=>{galleryFocused=true;reconcileGallery();});
  track.addEventListener('focusout',()=>{requestAnimationFrame(()=>{galleryFocused=track.contains(document.activeElement);reconcileGallery();});});
  track.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    galleryPointer=true;reconcileGallery();finishGalleryNavigation();
    galleryDrag={id:event.pointerId,type:event.pointerType,x:event.clientX,y:event.clientY,left:track.scrollLeft,moved:false};
  });
  track.addEventListener('pointermove',event=>{
    if(!galleryDrag||galleryDrag.id!==event.pointerId)return;
    const dx=event.clientX-galleryDrag.x;const dy=event.clientY-galleryDrag.y;
    if(!galleryDrag.moved&&Math.abs(dx)>7&&Math.abs(dx)>Math.abs(dy)){
      galleryDrag.moved=true;suppressGalleryClick=true;pauseGalleryByUser();track.classList.add('is-dragging');
      if(event.pointerType==='mouse')track.setPointerCapture(event.pointerId);
    }
    if(galleryDrag.moved&&event.pointerType==='mouse'){
      event.preventDefault();let target=galleryDrag.left-dx;
      if(target<0){galleryDrag.left+=galleryCycle;target+=galleryCycle;}
      if(target>=galleryCycle){galleryDrag.left-=galleryCycle;target-=galleryCycle;}
      track.scrollLeft=target;galleryPosition=target;
    }
  });
  function endGalleryPointer(event){
    if(!galleryDrag||galleryDrag.id!==event.pointerId)return;
    if(galleryDrag.moved||event.type==='pointercancel')pauseGalleryByUser();
    if(track.hasPointerCapture(event.pointerId))track.releasePointerCapture(event.pointerId);
    galleryDrag=null;galleryPointer=false;track.classList.remove('is-dragging');
    normalizeGalleryPosition();reconcileGallery();
    setTimeout(()=>{suppressGalleryClick=false;},0);
  }
  window.addEventListener('pointerup',endGalleryPointer);
  window.addEventListener('pointercancel',endGalleryPointer);
  track.addEventListener('click',event=>{if(suppressGalleryClick){event.preventDefault();event.stopPropagation();}},{capture:true});
  track.addEventListener('dragstart',event=>event.preventDefault());
  track.addEventListener('wheel',event=>{if(Math.abs(event.deltaX)>2){pauseGalleryByUser();}},{passive:true});
  track.addEventListener('scrollend',()=>{if(galleryNavigating)return;if(!galleryCanMove())normalizeGalleryPosition();});
  window.addEventListener('resize',()=>{finishGalleryNavigation();measureGallery();},{passive:true});
  document.addEventListener('visibilitychange',reconcileGallery);
  window.addEventListener('blur',()=>{if(galleryDrag){galleryDrag=null;galleryPointer=false;track.classList.remove('is-dragging');pauseGalleryByUser();}});
  [profileDialog,mediaDialog].forEach(dialog=>dialog.addEventListener('close',reconcileGallery));
  reducedMotion.addEventListener('change',event=>{if(event.matches)galleryWantsPlay=false;reconcileGallery();});
  if('IntersectionObserver' in window){
    new IntersectionObserver(entries=>{galleryInView=entries[0].isIntersecting;reconcileGallery();},{threshold:.08}).observe(track);
  }

  setLanguage('en');
})();
