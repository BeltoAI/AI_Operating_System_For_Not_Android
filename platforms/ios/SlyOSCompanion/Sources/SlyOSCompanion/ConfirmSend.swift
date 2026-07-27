import SwiftUI

/// The last thing between a draft and someone else's inbox.
///
/// SlyOS sent an email the moment it was asked to. It went to the right person and said the right
/// thing, and it was still wrong: an outbound message is not undoable, and the one time the address
/// or the wording is off there is no recovering it. Anything that leaves the phone is now read and
/// approved first, and can be edited in place.
///
/// Nothing here is a confirmation dialog in the weak sense — it shows the actual recipient and the
/// actual words, because "Send this?" with the content hidden trains people to tap yes.
struct ConfirmSend: View {

    struct Payload {
        var recipient: String
        var subject: String?
        var body: String
        /// What is about to happen, in plain words: "Email Joslyn", "Invite Joslyn to Date Night".
        var action: String
    }

    let payload: Payload
    let onSend: (Payload) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(SlySettings.self) private var settings

    @State private var recipient: String
    @State private var subject: String
    @State private var messageBody: String

    init(payload: Payload, onSend: @escaping (Payload) -> Void) {
        self.payload = payload
        self.onSend = onSend
        _recipient = State(initialValue: payload.recipient)
        _subject = State(initialValue: payload.subject ?? "")
        _messageBody = State(initialValue: payload.body)
    }

    var body: some View {
        let p = Palette(dark: settings.dark)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: T.md) {
                    Text(payload.action)
                        .font(.system(size: 24)).foregroundStyle(p.ink)

                    field("To", text: $recipient, palette: p)
                    if payload.subject != nil { field("Subject", text: $subject, palette: p) }

                    VStack(alignment: .leading, spacing: T.xs) {
                        Text("Message")
                            .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                        TextEditor(text: $messageBody)
                            .font(.system(size: T.body))
                            .foregroundStyle(p.ink)
                            .scrollContentBackground(.hidden)
                            .frame(minHeight: 220)
                            .padding(T.sm)
                            .background(RoundedRectangle(cornerRadius: 12).fill(p.bgElevated))
                    }

                    Text("Nothing has been sent yet. Check who it's going to.")
                        .font(.system(size: T.caption)).foregroundStyle(p.inkFaint)
                }
                .padding(T.md)
            }
            .background(p.bg.ignoresSafeArea())
            .navigationTitle("Ready to send")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.tint(p.inkFaint)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") {
                        onSend(Payload(recipient: recipient,
                                       subject: payload.subject == nil ? nil : subject,
                                       body: messageBody,
                                       action: payload.action))
                        dismiss()
                    }
                    .tint(p.accent)
                    .disabled(recipient.trimmingCharacters(in: .whitespaces).isEmpty
                              || messageBody.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .environment(\.palette, p)
        .preferredColorScheme(settings.dark ? .dark : .light)
    }

    private func field(_ label: String, text: Binding<String>, palette: Palette) -> some View {
        VStack(alignment: .leading, spacing: T.xs) {
            Text(label).font(.system(size: T.caption)).foregroundStyle(palette.inkFaint)
            TextField("", text: text)
                .font(.system(size: T.body))
                .foregroundStyle(palette.ink)
                .textFieldStyle(.plain)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            Rectangle().fill(palette.hairline).frame(height: 1)
        }
    }
}
