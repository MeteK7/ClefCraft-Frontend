import { Injectable } from '@angular/core';

/**
 * Which items' asks are on screen right now. A Chime In panel registers its item while it
 * shows it, so a realtime ask event for that item refreshes the panel instead of raising a toast
 * about something the user is already looking at.
 */
@Injectable({ providedIn: 'root' })
export class OpenAskItemsService {
  // A count per item: the same item can be open in more than one place.
  private readonly open = new Map<number, number>();

  register(itemId: number): void {
    this.open.set(itemId, (this.open.get(itemId) ?? 0) + 1);
  }

  unregister(itemId: number): void {
    const count = (this.open.get(itemId) ?? 0) - 1;
    if (count > 0) {
      this.open.set(itemId, count);
    } else {
      this.open.delete(itemId);
    }
  }

  isOpen(itemId: number): boolean {
    return this.open.has(itemId);
  }
}
