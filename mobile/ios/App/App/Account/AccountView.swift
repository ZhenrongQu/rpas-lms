import SwiftUI

struct AccountView: View {
    @EnvironmentObject var auth: AuthViewModel

    var body: some View {
        NavigationView {
            List {
                Button {
                    Task { await auth.signOut() }
                } label: {
                    Text("Sign Out")
                        .foregroundColor(.red)
                }
            }
            .navigationTitle("Account")
        }
    }
}
