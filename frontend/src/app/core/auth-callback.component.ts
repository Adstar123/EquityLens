import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `<div class="p-8 text-text-secondary">Authenticating...</div>`,
})
export class AuthCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      this.auth.login(token);
      this.router.navigate(['/dashboard']);
    } else {
      this.router.navigate(['/']);
    }
  }
}
