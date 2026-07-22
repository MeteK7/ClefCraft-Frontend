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
  }

  toggle() {

    document.body.classList.contains('dark-theme')
      ? this.enableLight()
      : this.enableDark();

  }

  enableDark() {

    document.body.classList.add('dark-theme');

    localStorage.setItem(this.key,'dark');

  }

  enableLight() {

    document.body.classList.remove('dark-theme');

    localStorage.setItem(this.key,'light');

  }

  get isDark() {

    return document.body.classList.contains('dark-theme');

  }

}