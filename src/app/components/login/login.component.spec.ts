import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { of } from 'rxjs';

import { LoginComponent } from './login.component';
import { AuthService } from '../../_services/auth.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ToastrService, useValue: jasmine.createSpyObj('ToastrService', ['success', 'error']) },
      ]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('sign-out notice', () => {
    function noticeFor(reason: string | null): string | null {
      (TestBed.inject(ActivatedRoute) as { snapshot: unknown }).snapshot = {
        queryParamMap: convertToParamMap(reason === null ? {} : { reason })
      };
      component.signOutNotice = null;
      component.ngOnInit();
      return component.signOutNotice;
    }

    it('explains an inactivity sign-out', () => {
      expect(noticeFor('idle')).toContain('inactivity');
    });

    it('explains an expired session', () => {
      expect(noticeFor('expired')).toContain('expired');
    });

    it('shows nothing for a normal visit or an unknown reason', () => {
      expect(noticeFor(null)).toBeNull();
      expect(noticeFor('<script>')).toBeNull();
    });
  });

  describe('after a successful login', () => {
    const session = { token: 't', refreshToken: 'r', refreshTokenExpiresAt: '2099-01-01T00:00:00Z' };

    function loginWithReturnUrl(returnUrl: string | null): jasmine.Spy {
      (TestBed.inject(ActivatedRoute) as { snapshot: unknown }).snapshot = {
        queryParamMap: convertToParamMap(returnUrl === null ? {} : { returnUrl })
      };
      const auth = TestBed.inject(AuthService);
      spyOn(auth, 'login').and.returnValue(of(session));
      spyOn(auth, 'setSession');
      spyOn(auth, 'loadCurrentUser').and.returnValue(of({ id: 'u1' }));
      const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl');

      component.form.setValue({ email: 'a@test.com', password: 'secret1' });
      component.submit();

      expect(auth.setSession).toHaveBeenCalledWith(session);
      return navigate;
    }

    it('returns to the page the user was sent away from', () => {
      expect(loginWithReturnUrl('/board?openItemId=3')).toHaveBeenCalledWith('/board?openItemId=3');
    });

    it('defaults to the calendar without a return url', () => {
      expect(loginWithReturnUrl(null)).toHaveBeenCalledWith('/calendar');
    });

    for (const unsafe of ['https://evil.example', '//evil.example', '/\\evil.example', '/login']) {
      it(`ignores the unsafe return url "${unsafe}"`, () => {
        expect(loginWithReturnUrl(unsafe)).toHaveBeenCalledWith('/calendar');
      });
    }
  });
});
