import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {

  private readonly key = 'theme';

  constructor() {

    const saved = localStorage.getItem(this.key);

    if (saved === 'dark')
      this.enableDark();
    else if (saved === null && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      // No explicit choice saved yet — respect the OS preference on first visit,
      // without writing it to localStorage, so it isn't treated as an explicit
      // user choice and a later OS-level change can still take effect next load.
      document.body.classList.add('dark-theme');
    }

  }

  toggle() {

    document.body.classList.contains('dark-theme')
      ? this.enableLight()
      : this.enableDark();

  }

  enableDark() {

    document.body.classList.add('dark-theme');

    localStorage.setItem(this.key, 'dark');

  }

  enableLight() {

    document.body.classList.remove('dark-theme');

    localStorage.setItem(this.key, 'light');

  }

  get isDark() {

    return document.body.classList.contains('dark-theme');

  }

}
