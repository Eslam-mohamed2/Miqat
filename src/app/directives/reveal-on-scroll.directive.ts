import {
  Directive,
  ElementRef,
  OnInit,
  OnDestroy,
  Input,
  inject,
} from '@angular/core';

@Directive({
  selector: '[appRevealOnScroll]',
  standalone: true,
})
export class RevealOnScrollDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef<HTMLElement>);
  private observer: IntersectionObserver | null = null;

  /** Root margin so elements animate a bit before fully in view (e.g. "0px 0px -80px 0px") */
  @Input() appRevealRootMargin = '0px 0px -60px 0px';
  /** Threshold 0–1; trigger when this fraction is visible */
  @Input() appRevealThreshold = 0.1;

  ngOnInit(): void {
    this.el.nativeElement.classList.add('reveal-on-scroll');
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            this.observer?.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: this.appRevealRootMargin,
        threshold: this.appRevealThreshold,
      }
    );
    this.observer.observe(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
