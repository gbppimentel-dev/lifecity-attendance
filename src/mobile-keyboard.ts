const viewport = window.visualViewport
let timer: ReturnType<typeof setTimeout>
function updateKeyboard() {
 const target = document.activeElement
 const editing = target instanceof HTMLElement && target.matches('input:not([type=checkbox]),textarea,[contenteditable=true]')
 const mobile = window.matchMedia('(max-width:900px)').matches
 document.documentElement.classList.toggle('lc-keyboard-editing', mobile && editing)
 if (mobile && editing && target.closest('.manual-member-search,.service-form-card')) {
  clearTimeout(timer)
  timer=setTimeout(()=>{if(document.activeElement===target)target.scrollIntoView({block:'center',behavior:'auto'})},180)
 }
}
viewport?.addEventListener('resize',updateKeyboard)
document.addEventListener('focusin',updateKeyboard)
document.addEventListener('focusout',()=>setTimeout(updateKeyboard,0))
