import Foundation
import Photos
import UIKit

// MARK: - Results Modal View Controller

public class ResultsViewController: UIViewController {
    private let result: VerifyResult
    private let scrollView = UIScrollView()
    private let contentView = UIView()
    private let stackView = UIStackView()
    
    public init(result: VerifyResult) {
        self.result = result
        super.init(nibName: nil, bundle: nil)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    public override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        setupAccessibility()
    }
    
    private func setupUI() {
        view.backgroundColor = .systemBackground
        
        // Navigation
        navigationItem.title = "Content Credentials"
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .done,
            target: self,
            action: #selector(dismissTapped)
        )
        
        // Scroll view setup
        view.addSubview(scrollView)
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(contentView)
        contentView.translatesAutoresizingMaskIntoConstraints = false
        
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            
            contentView.topAnchor.constraint(equalTo: scrollView.topAnchor),
            contentView.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
            contentView.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
            contentView.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
            contentView.widthAnchor.constraint(equalTo: scrollView.widthAnchor)
        ])
        
        // Stack view setup
        contentView.addSubview(stackView)
        stackView.axis = .vertical
        stackView.spacing = 16
        stackView.translatesAutoresizingMaskIntoConstraints = false
        
        NSLayoutConstraint.activate([
            stackView.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 20),
            stackView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 20),
            stackView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -20),
            stackView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -20)
        ])
        
        addContent()
    }
    
    private func addContent() {
        // Status banner
        let statusBanner = createStatusBanner()
        stackView.addArrangedSubview(statusBanner)
        
        // Issuer information
        if let issuer = result.issuerDisplayName {
            stackView.addArrangedSubview(createInfoRow(
                title: "Issuer",
                value: issuer,
                icon: "person.circle.fill"
            ))
        }
        
        // Key ID
        if let keyId = result.keyId {
            stackView.addArrangedSubview(createInfoRow(
                title: "Key ID",
                value: keyId,
                icon: "key.fill"
            ))
        }
        
        // Timestamp
        if let timestamp = result.timestamp {
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .medium
            stackView.addArrangedSubview(createInfoRow(
                title: "Verified",
                value: formatter.string(from: timestamp),
                icon: "clock.fill"
            ))
        }
        
        // Hardware attestation
        if result.hardwareAttested {
            stackView.addArrangedSubview(createInfoRow(
                title: "Hardware Attested",
                value: "Yes",
                icon: "checkmark.shield.fill"
            ))
        }
        
        // Messages
        if !result.messages.isEmpty {
            stackView.addArrangedSubview(createMessagesSection())
        }
        
        // Manifest URL
        if let manifestURL = result.manifestURL {
            stackView.addArrangedSubview(createManifestLink(manifestURL))
        }
        
        // Disclaimer
        stackView.addArrangedSubview(createDisclaimer())
        
        // Verify button
        if result.manifestURL != nil {
            stackView.addArrangedSubview(createVerifyButton())
        }
    }
    
    private func createStatusBanner() -> UIView {
        let container = UIView()
        container.layer.cornerRadius = 12
        container.layer.masksToBounds = true
        
        let iconView = UIImageView()
        iconView.contentMode = .scaleAspectFit
        iconView.tintColor = .white
        
        let label = UILabel()
        label.font = UIFont.systemFont(ofSize: 16, weight: .semibold)
        label.textColor = .white
        label.numberOfLines = 0
        
        let stackView = UIStackView(arrangedSubviews: [iconView, label])
        stackView.axis = .horizontal
        stackView.spacing = 12
        stackView.alignment = .center
        stackView.translatesAutoresizingMaskIntoConstraints = false
        
        container.addSubview(stackView)
        NSLayoutConstraint.activate([
            stackView.topAnchor.constraint(equalTo: container.topAnchor, constant: 16),
            stackView.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 16),
            stackView.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -16),
            stackView.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -16)
        ])
        
        switch result.state {
        case .verified:
            container.backgroundColor = .systemGreen
            iconView.image = UIImage(systemName: "checkmark.circle.fill")
            label.text = "Verified - Authentic Content"
            
        case .verifiedWithWarnings:
            container.backgroundColor = .systemOrange
            iconView.image = UIImage(systemName: "exclamationmark.triangle.fill")
            label.text = "Verified with Warnings"
            
        case .unverified:
            container.backgroundColor = .systemRed
            iconView.image = UIImage(systemName: "xmark.circle.fill")
            label.text = "Not Verified - Tampered or Invalid"
            
        case .unresolvedRemote:
            container.backgroundColor = .systemGray
            iconView.image = UIImage(systemName: "questionmark.circle.fill")
            label.text = "Unresolved - Remote Manifest Unavailable"
        }
        
        // Accessibility
        container.isAccessibilityElement = true
        container.accessibilityLabel = "Verification status: \(label.text ?? "")"
        container.accessibilityTraits = .staticText
        
        return container
    }
    
    private func createInfoRow(title: String, value: String, icon: String) -> UIView {
        let container = UIView()
        container.backgroundColor = .secondarySystemBackground
        container.layer.cornerRadius = 8
        
        let iconView = UIImageView(image: UIImage(systemName: icon))
        iconView.contentMode = .scaleAspectFit
        iconView.tintColor = .systemBlue
        iconView.translatesAutoresizingMaskIntoConstraints = false
        
        let titleLabel = UILabel()
        titleLabel.text = title
        titleLabel.font = UIFont.systemFont(ofSize: 14, weight: .medium)
        titleLabel.textColor = .secondaryLabel
        
        let valueLabel = UILabel()
        valueLabel.text = value
        valueLabel.font = UIFont.systemFont(ofSize: 14)
        valueLabel.textColor = .label
        valueLabel.numberOfLines = 0
        
        let stackView = UIStackView(arrangedSubviews: [titleLabel, valueLabel])
        stackView.axis = .vertical
        stackView.spacing = 4
        
        let mainStack = UIStackView(arrangedSubviews: [iconView, stackView])
        mainStack.axis = .horizontal
        mainStack.spacing = 12
        mainStack.alignment = .top
        mainStack.translatesAutoresizingMaskIntoConstraints = false
        
        container.addSubview(mainStack)
        NSLayoutConstraint.activate([
            iconView.widthAnchor.constraint(equalToConstant: 20),
            iconView.heightAnchor.constraint(equalToConstant: 20),
            
            mainStack.topAnchor.constraint(equalTo: container.topAnchor, constant: 12),
            mainStack.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 12),
            mainStack.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -12),
            mainStack.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -12)
        ])
        
        return container
    }
    
    private func createMessagesSection() -> UIView {
        let container = UIView()
        container.backgroundColor = .secondarySystemBackground
        container.layer.cornerRadius = 8
        
        let titleLabel = UILabel()
        titleLabel.text = "Messages"
        titleLabel.font = UIFont.systemFont(ofSize: 14, weight: .medium)
        titleLabel.textColor = .secondaryLabel
        
        let messagesStack = UIStackView()
        messagesStack.axis = .vertical
        messagesStack.spacing = 8
        
        for message in result.messages {
            let messageLabel = UILabel()
            messageLabel.text = "• \(message)"
            messageLabel.font = UIFont.systemFont(ofSize: 14)
            messageLabel.textColor = .label
            messageLabel.numberOfLines = 0
            messagesStack.addArrangedSubview(messageLabel)
        }
        
        let stackView = UIStackView(arrangedSubviews: [titleLabel, messagesStack])
        stackView.axis = .vertical
        stackView.spacing = 8
        stackView.translatesAutoresizingMaskIntoConstraints = false
        
        container.addSubview(stackView)
        NSLayoutConstraint.activate([
            stackView.topAnchor.constraint(equalTo: container.topAnchor, constant: 12),
            stackView.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 12),
            stackView.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -12),
            stackView.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -12)
        ])
        
        return container
    }
    
    private func createManifestLink(_ url: URL) -> UIView {
        let button = UIButton(type: .system)
        button.setTitle("View Full Manifest", for: .normal)
        button.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .medium)
        button.backgroundColor = .systemBlue
        button.setTitleColor(.white, for: .normal)
        button.layer.cornerRadius = 8
        button.translatesAutoresizingMaskIntoConstraints = false
        
        button.addAction(UIAction { _ in
            UIApplication.shared.open(url)
        }, for: .touchUpInside)
        
        NSLayoutConstraint.activate([
            button.heightAnchor.constraint(equalToConstant: 44)
        ])
        
        return button
    }
    
    private func createDisclaimer() -> UIView {
        let label = UILabel()
        label.text = "Provenance evidence; not truth. This verifies the content's origin and integrity, not its accuracy or appropriateness."
        label.font = UIFont.systemFont(ofSize: 12)
        label.textColor = .secondaryLabel
        label.numberOfLines = 0
        label.textAlignment = .center
        
        return label
    }
    
    private func createVerifyButton() -> UIView {
        let button = UIButton(type: .system)
        button.setTitle("Verify in Browser", for: .normal)
        button.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .medium)
        button.backgroundColor = .systemGray5
        button.setTitleColor(.label, for: .normal)
        button.layer.cornerRadius = 8
        button.translatesAutoresizingMaskIntoConstraints = false
        
        if let manifestURL = result.manifestURL {
            button.addAction(UIAction { _ in
                // Open in public verifier
                let verifierURL = URL(string: "https://verify.credlink.org")!
                UIApplication.shared.open(verifierURL)
            }, for: .touchUpInside)
        }
        
        NSLayoutConstraint.activate([
            button.heightAnchor.constraint(equalToConstant: 44)
        ])
        
        return button
    }
    
    private func setupAccessibility() {
        // Ensure VoiceOver support
        view.isAccessibilityElement = false
        
        // Set up accessibility for key elements
        stackView.isAccessibilityElement = false
        stackView.accessibilityLabel = "Verification details"
        
        // Make interactive elements accessible
        if let verifyButton = stackView.arrangedSubviews.last(where: { $0 is UIButton }) {
            verifyButton.isAccessibilityElement = true
            verifyButton.accessibilityLabel = "Verify content in web browser"
            verifyButton.accessibilityHint = "Opens the content verification page in Safari"
            verifyButton.accessibilityTraits = .button
        }
    }
    
    @objc private func dismissTapped() {
        dismiss(animated: true)
    }
}

// MARK: - Share Extension Integration

public class ShareExtensionHandler: NSObject {
    private let config: C2CConfig
    private let verifier: C2CMobileVerifier
    
    public init(config: C2CConfig) {
        self.config = config
        self.verifier = C2CMobileVerifier(config: config)
    }
    
    public func handleSharedItems(_ items: [NSExtensionItem], completion: @escaping (ResultsViewController?) -> Void) {
        guard let item = items.first else {
            completion(nil)
            return
        }
        
        // Handle URL
        if let itemProvider = item.attachments?.first,
           itemProvider.hasItemConformingToTypeIdentifier("public.url") {
            itemProvider.loadItem(forTypeIdentifier: "public.url", options: nil) { (url, error) in
                guard let url = url as? URL else {
                    completion(nil)
                    return
                }
                
                self.verifier.verify(url: url, preferRelay: true) { result in
                    let resultsVC = ResultsViewController(result: result)
                    completion(resultsVC)
                }
            }
            return
        }
        
        // Handle image
        if let itemProvider = item.attachments?.first,
           itemProvider.hasItemConformingToTypeIdentifier("public.image") {
            itemProvider.loadItem(forTypeIdentifier: "public.image", options: nil) { (image, error) in
                guard let imageData = image as? Data else {
                    completion(nil)
                    return
                }
                
                // Save to temp file and verify
                let tempURL = FileManager.default.temporaryDirectory
                    .appendingPathComponent(UUID().uuidString)
                    .appendingPathExtension("jpg")
                
                do {
                    try imageData.write(to: tempURL)
                    
                    // Create PHAsset from temp file
                    // This would require PhotoKit integration
                    // For now, return a basic result
                    let result = VerifyResult(
                        state: .unverified,
                        messages: ["Share extension image verification not yet implemented"]
                    )
                    
                    let resultsVC = ResultsViewController(result: result)
                    completion(resultsVC)
                } catch {
                    completion(nil)
                }
            }
            return
        }
        
        completion(nil)
    }
}
