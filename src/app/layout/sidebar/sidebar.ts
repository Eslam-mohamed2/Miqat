import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { GroupService } from '../../core/services/group.service';
import { UserService } from '../../core/services/user.service';
import { UiService } from '../../core/services/ui.service';
import { AuthService } from '../../core/services/auth.service';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { GroupDto, UserDto } from '../../models/api.models';

interface NavItem {
  label: string;
  /** null when the destination does not exist yet. */
  route: string | null;
  icon: string;
  disabled?: boolean;
}

const WIDTH_STORAGE_KEY = 'miqat.sidebar.width';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Sidebar implements OnInit {
  private groupService = inject(GroupService);
  private userService = inject(UserService);
  public uiService = inject(UiService);
  private authService = inject(AuthService);

  private router = inject(Router);

  groups$!: Observable<GroupDto[]>;
  user$!: Observable<UserDto | null>;
  isCollapsed = signal(false);
  isMobileMenuOpen = signal(false);

  /** Drag-to-resize bounds. 290px is the floor the layout is designed around. */
  readonly minWidth = 290;
  readonly maxWidth = 460;

  width = signal(this.restoreWidth());
  /** Fully hidden, as opposed to collapsed to the icon rail. */
  /** Shared signal, so an avatar change anywhere lands here too. */
  readonly currentUser = this.userService.currentUser;

  isHidden = signal(false);
  isResizing = signal(false);

  private resizeMove?: (event: PointerEvent) => void;
  private resizeEnd?: () => void;

  // `/whiteboard` and `/node-flow` are real routes now, so these link straight
  // at the board instead of at `/new`. `/kanban` and `/help` have no component
  // at all and are flagged `disabled` rather than linked into a router error.
  navItemsApp: NavItem[] = [
    { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
    { label: 'Task List/Kanban', route: '/tasks', icon: 'view_kanban' },
    { label: 'Calendar', route: '/calendar', icon: 'calendar_today' },
    { label: 'Whiteboard', route: '/whiteboard', icon: 'edit' },
    { label: 'Node Flow', route: '/node-flow', icon: 'account_tree' },
  ];

  navItemsOther: NavItem[] = [
    { label: 'Settings', route: '/settings', icon: 'settings' },
    { label: 'Help Center', route: null, icon: 'help_outline', disabled: true },
  ];

  ngOnInit() {
    // Both feed `| async`, which rethrows into the template on error — so each
    // stream degrades to an empty value instead of taking the sidebar down.
    this.groups$ = this.groupService.getGroups().pipe(catchError(() => of([])));
    // Kick off the fetch, but render from the shared signal: a one-shot
    // observable never sees a later avatar change, which is why the sidebar
    // kept the old picture after an upload.
    this.userService.getMe().pipe(catchError(() => of(null))).subscribe();
  }

  /** UserDto exposes `fullName`, not `firstName`/`lastName`. */
  displayName(user: UserDto): string {
    return user.fullName?.trim() || user.email || '';
  }

  toggleSidebar() {
    this.isCollapsed.set(!this.isCollapsed());
  }

  /** Hides the sidebar entirely; a floating handle brings it back. */
  hideSidebar() {
    this.isHidden.set(true);
  }

  showSidebar() {
    this.isHidden.set(false);
  }

  // ── Resizing ───────────────────────────────────────────────────────────────

  /**
   * Drag the right edge to resize. Listeners live on the document so the drag
   * keeps tracking even when the pointer runs ahead of the 4px handle, and
   * pointer events cover mouse, pen and touch with one code path.
   */
  startResize(event: PointerEvent) {
    if (this.isCollapsed()) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = this.width();

    this.isResizing.set(true);

    this.resizeMove = (moveEvent: PointerEvent) => {
      const next = startWidth + (moveEvent.clientX - startX);
      this.width.set(Math.min(this.maxWidth, Math.max(this.minWidth, next)));
    };

    this.resizeEnd = () => {
      this.isResizing.set(false);
      this.persistWidth(this.width());
      document.removeEventListener('pointermove', this.resizeMove!);
      document.removeEventListener('pointerup', this.resizeEnd!);
      document.removeEventListener('pointercancel', this.resizeEnd!);
    };

    document.addEventListener('pointermove', this.resizeMove);
    document.addEventListener('pointerup', this.resizeEnd);
    document.addEventListener('pointercancel', this.resizeEnd);
  }

  /** Keyboard resizing, so the handle is not mouse-only. */
  onResizeKey(event: KeyboardEvent) {
    const step = event.shiftKey ? 32 : 8;
    let next: number | null = null;

    if (event.key === 'ArrowLeft') next = this.width() - step;
    if (event.key === 'ArrowRight') next = this.width() + step;
    if (next === null) return;

    event.preventDefault();
    this.width.set(Math.min(this.maxWidth, Math.max(this.minWidth, next)));
    this.persistWidth(this.width());
  }

  resetWidth() {
    this.width.set(this.minWidth);
    this.persistWidth(this.minWidth);
  }

  private restoreWidth(): number {
    try {
      const stored = Number(localStorage?.getItem(WIDTH_STORAGE_KEY));
      if (!Number.isFinite(stored) || stored <= 0) return 290;
      return Math.min(460, Math.max(290, stored));
    } catch {
      return 290;
    }
  }

  private persistWidth(value: number) {
    try {
      localStorage?.setItem(WIDTH_STORAGE_KEY, String(value));
    } catch {
      // Storage unavailable — the width just will not survive a reload.
    }
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen.set(!this.isMobileMenuOpen());
  }

  closeMobileMenu() {
    this.isMobileMenuOpen.set(false);
  }

  onLogout() {
    this.closeMobileMenu();
    this.authService.logout().subscribe();
  }
}
