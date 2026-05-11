import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FriendService } from '../../core/services/friend.service';

import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Router } from '@angular/router';
import { UserService } from '../../core/services/user.service';

@Component({
  selector: 'app-friends-page',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './friends-page.html',
  styleUrl: './friends-page.scss'
})
export class FriendsPage implements OnInit {
  activeTab = signal<'suggestions' | 'friends' | 'pending' | 'sent'>('suggestions');
  friendService = inject(FriendService);
  userService = inject(UserService);
  router = inject(Router);

  suggestionsList = signal<any[]>([]);
  friendsList = signal<any[]>([]);
  pendingList = signal<any[]>([]);
  sentList = signal<any[]>([]);
  
  loading = signal(false);

  searchQuery = new Subject<string>();
  searchText = signal('');

  ngOnInit() {
    this.searchQuery.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(query => {
      this.searchText.set(query);
      if (this.activeTab() === 'suggestions') {
        if (query) {
           this.loading.set(true);
           this.userService.searchUsers(query).subscribe({
             next: (data) => { this.suggestionsList.set(data); this.loading.set(false); },
             error: () => this.loading.set(false)
           });
        } else {
           this.loadData();
        }
      }
    });

    this.loadData();
  }

  onSearch(event: any) {
    this.searchQuery.next(event.target.value);
  }

  loadData() {
    this.loading.set(true);
    if (this.activeTab() === 'suggestions') {
      this.friendService.getSuggestions().subscribe({
        next: (data) => { this.suggestionsList.set(data); this.loading.set(false); },
        error: () => this.loading.set(false)
      });
    } else if (this.activeTab() === 'friends') {
      this.friendService.getMyFriends().subscribe({
        next: (data) => { this.friendsList.set(data); this.loading.set(false); },
        error: () => this.loading.set(false)
      });
    } else if (this.activeTab() === 'pending') {
      this.friendService.getPendingRequests().subscribe({
        next: (data) => { this.pendingList.set(data); this.loading.set(false); },
        error: () => this.loading.set(false)
      });
    } else {
      this.friendService.getSentRequests().subscribe({
        next: (data) => { this.sentList.set(data); this.loading.set(false); },
        error: () => this.loading.set(false)
      });
    }
  }

  setTab(tab: 'suggestions' | 'friends' | 'pending' | 'sent') {
    this.activeTab.set(tab);
    this.loadData();
  }

  sendRequest(userId: string) {
    this.friendService.sendRequest(userId).subscribe(() => {
       this.suggestionsList.update(list => list.map(u => u.id === userId ? { ...u, requestSent: true } : u));
    });
  }

  acceptRequest(id: string) {
    this.friendService.acceptRequest(id).subscribe(() => this.loadData());
  }

  rejectRequest(id: string) {
    this.friendService.rejectRequest(id).subscribe(() => this.loadData());
  }

  unfriend(id: string) {
    if(confirm('Are you sure you want to unfriend?')) {
      this.friendService.unfriend(id).subscribe(() => this.loadData());
    }
  }

  cancelRequest(id: string) {
    this.friendService.unfriend(id).subscribe(() => this.loadData());
  }

  blockUser(userId: string) {
    this.friendService.blockUser(userId).subscribe(() => this.loadData());
  }

  viewProfile(userId: string) {
    this.router.navigate(['/profile', userId]);
  }
}
