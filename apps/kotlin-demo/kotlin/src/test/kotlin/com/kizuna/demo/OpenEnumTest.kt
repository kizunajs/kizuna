package com.kizuna.demo

import com.kizuna.demo.openenum.OpenEnumAPI
import com.kizuna.demo.openenum.OpenEnumAPIClient
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class OpenEnumTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun decodesKnownValue() {
        val decoded = json.decodeFromString(OpenEnumAPI.EventKind.Serializer, "\"login\"")
        assertEquals(OpenEnumAPI.EventKind.LOGIN, decoded)
    }

    @Test
    fun fallsBackToUnknownInsteadOfThrowing() {
        val decoded = json.decodeFromString(OpenEnumAPI.EventKind.Serializer, "\"teleport\"")
        assertEquals(OpenEnumAPI.EventKind.Unknown("teleport"), decoded)
    }

    @Test
    fun unknownWireValueRoundTrips() {
        val encoded = json.encodeToString(
            OpenEnumAPI.EventKind.Serializer,
            OpenEnumAPI.EventKind.Unknown("teleport"),
        )
        assertEquals("\"teleport\"", encoded)
    }

    @Test
    fun unknownValueDegradesOneFieldNotTheWholeObject() {
        val payload = """{"id":"evt_1","kind":"teleport","occurredAt":"2026-01-01T00:00:00Z","userId":"user_1"}"""
        val record = json.decodeFromString(OpenEnumAPI.EventRecord.serializer(), payload)
        assertEquals(OpenEnumAPI.EventKind.Unknown("teleport"), record.kind)
        assertEquals("evt_1", record.id)
        assertEquals("user_1", record.userId)
    }

    @Test
    fun decodesAUnionMemberItDoesNotKnow() {
        val payload = """{"kind":"passkey_added","at":"2026-01-01T00:00:00Z"}"""
        val event = json.decodeFromString(OpenEnumAPI.UserSessionEvent.Serializer, payload)
        assertEquals(OpenEnumAPI.UserSessionEvent.Unknown("passkey_added"), event)
    }

    @Test
    fun refusesToSendAUnionMemberItDoesNotKnow() {
        assertFailsWith<SerializationException> {
            json.encodeToString(OpenEnumAPI.UserSessionEvent.Serializer, OpenEnumAPI.UserSessionEvent.Unknown("passkey_added"))
        }
    }

    @Test
    fun skipsAToolCallFromAToolItDoesNotKnow() {
        val records = OpenEnumAPIClient.AssistantChat.readToolCalls(
            listOf(OpenEnumAPIClient.AssistantChat.Event.ToolCall(OpenEnumAPIClient.AssistantChat.ToolCall.Unknown("calendar_add"))),
        )
        assertEquals(emptyList(), records)
    }
}
