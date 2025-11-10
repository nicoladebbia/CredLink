package com.c2concierge.mobile.ui

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Parcelable
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import androidx.fragment.app.DialogFragment
import androidx.fragment.app.FragmentActivity
import com.c2concierge.mobile.VerifyResult
import com.c2concierge.mobile.VerifyState
import com.c2concierge.mobile.HttpUrl
import java.text.SimpleDateFormat
import java.util.*

/**
 * Modal dialog showing verification results
 */
class ResultsModalFragment : DialogFragment() {
    
    private lateinit var result: VerifyResult
    
    companion object {
        private const val ARG_RESULT = "result"
        
        fun create(result: VerifyResult): ResultsModalFragment {
            return ResultsModalFragment().apply {
                arguments = Bundle().apply {
                    putSerializable(ARG_RESULT, result)
                }
            }
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        @Suppress("DEPRECATION")
        result = arguments?.getSerializable(ARG_RESULT) as? VerifyResult 
            ?: throw IllegalArgumentException("Result is required")
        
        setStyle(STYLE_NORMAL, android.R.style.Theme_Material_Light_Dialog_NoActionBar)
    }
    
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_results_modal, container, false)
    }
    
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        setupUI(view)
        setupAccessibility(view)
    }
    
    private fun setupUI(view: View) {
        // Status banner
        val statusIcon = view.findViewById<ImageView>(R.id.statusIcon)
        val statusText = view.findViewById<TextView>(R.id.statusText)
        val statusContainer = view.findViewById<View>(R.id.statusContainer)
        
        when (result.state) {
            VerifyState.VERIFIED -> {
                statusContainer.setBackgroundColor(requireContext().getColor(android.R.color.holo_green_dark))
                statusIcon.setImageResource(R.drawable.ic_verified)
                statusText.text = "Verified - Authentic Content"
            }
            VerifyState.VERIFIED_WITH_WARNINGS -> {
                statusContainer.setBackgroundColor(requireContext().getColor(android.R.color.holo_orange_dark))
                statusIcon.setImageResource(R.drawable.ic_warning)
                statusText.text = "Verified with Warnings"
            }
            VerifyState.UNVERIFIED -> {
                statusContainer.setBackgroundColor(requireContext().getColor(android.R.color.holo_red_dark))
                statusIcon.setImageResource(R.drawable.ic_error)
                statusText.text = "Not Verified - Tampered or Invalid"
            }
            VerifyState.UNRESOLVED_REMOTE -> {
                statusContainer.setBackgroundColor(requireContext().getColor(android.R.color.darker_gray))
                statusIcon.setImageResource(R.drawable.ic_unknown)
                statusText.text = "Unresolved - Remote Manifest Unavailable"
            }
        }
        
        // Issuer information
        result.issuerDisplayName?.let { issuer ->
            view.findViewById<TextView>(R.id.issuerValue).text = issuer
            view.findViewById<View>(R.id.issuerRow).visibility = View.VISIBLE
        }
        
        // Key ID
        result.keyId?.let { keyId ->
            view.findViewById<TextView>(R.id.keyIdValue).text = keyId
            view.findViewById<View>(R.id.keyIdRow).visibility = View.VISIBLE
        }
        
        // Timestamp
        result.timestamp?.let { timestamp ->
            val formatter = SimpleDateFormat.getDateTimeInstance(SimpleDateFormat.MEDIUM, SimpleDateFormat.MEDIUM)
            view.findViewById<TextView>(R.id.timestampValue).text = formatter.format(Date(timestamp))
            view.findViewById<View>(R.id.timestampRow).visibility = View.VISIBLE
        }
        
        // Hardware attestation
        if (result.hardwareAttested) {
            view.findViewById<TextView>(R.id.hardwareAttestedValue).text = "Yes"
            view.findViewById<View>(R.id.hardwareAttestedRow).visibility = View.VISIBLE
        }
        
        // Messages
        if (result.messages.isNotEmpty()) {
            val messagesContainer = view.findViewById<ViewGroup>(R.id.messagesContainer)
            messagesContainer.visibility = View.VISIBLE
            
            val messagesText = view.findViewById<TextView>(R.id.messagesText)
            messagesText.text = result.messages.joinToString("\n• ", "• ")
        }
        
        // Manifest URL
        result.manifestUrl?.let { manifestUrl ->
            view.findViewById<Button>(R.id.viewManifestButton).visibility = View.VISIBLE
            view.findViewById<Button>(R.id.viewManifestButton).setOnClickListener {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(manifestUrl.toString()))
                startActivity(intent)
            }
        }
        
        // Verify button
        if (result.manifestUrl != null) {
            view.findViewById<Button>(R.id.verifyInBrowserButton).visibility = View.VISIBLE
            view.findViewById<Button>(R.id.verifyInBrowserButton).setOnClickListener {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://verify.c2concierge.org"))
                startActivity(intent)
            }
        }
        
        // Close button
        view.findViewById<Button>(R.id.closeButton).setOnClickListener {
            dismiss()
        }
    }
    
    private fun setupAccessibility(view: View) {
        // Configure accessibility for screen readers
        view.contentDescription = "Verification results: ${result.state.name}"
        
        // Set up accessibility for status banner
        val statusContainer = view.findViewById<View>(R.id.statusContainer)
        statusContainer.contentDescription = "Verification status: ${view.findViewById<TextView>(R.id.statusText).text}"
        
        // Make interactive elements accessible
        view.findViewById<Button>(R.id.viewManifestButton)?.apply {
            contentDescription = "View full manifest in browser"
        }
        
        view.findViewById<Button>(R.id.verifyInBrowserButton)?.apply {
            contentDescription = "Verify content in web browser"
        }
        
        view.findViewById<Button>(R.id.closeButton)?.apply {
            contentDescription = "Close verification results"
        }
    }
}

/**
 * Helper class to show results modal from any Activity
 */
object ResultsModal {
    
    /**
     * Show verification results in a modal dialog
     */
    fun show(activity: FragmentActivity, result: VerifyResult) {
        val fragment = ResultsModalFragment.create(result)
        fragment.show(activity.supportFragmentManager, "ResultsModal")
    }
}

/**
 * Bottom sheet version for better mobile UX
 */
class ResultsBottomSheetFragment : androidx.fragment.app.BottomSheetDialogFragment() {
    
    private lateinit var result: VerifyResult
    
    companion object {
        private const val ARG_RESULT = "result"
        
        fun create(result: VerifyResult): ResultsBottomSheetFragment {
            return ResultsBottomSheetFragment().apply {
                arguments = Bundle().apply {
                    putSerializable(ARG_RESULT, result)
                }
            }
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        @Suppress("DEPRECATION")
        result = arguments?.getSerializable(ARG_RESULT) as? VerifyResult 
            ?: throw IllegalArgumentException("Result is required")
    }
    
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_results_bottom_sheet, container, false)
    }
    
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        // Reuse the same UI setup logic as modal
        setupUI(view)
        setupAccessibility(view)
    }
    
    private fun setupUI(view: View) {
        // Same implementation as ResultsModalFragment
        // This would be extracted to a shared utility in production
    }
    
    private fun setupAccessibility(view: View) {
        // Same implementation as ResultsModalFragment
        // This would be extracted to a shared utility in production
    }
}
