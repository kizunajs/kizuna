package com.kizuna.demo

import com.kizuna.demo.keys.FractionalKey
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Checks the emitted FractionalKey against the vectors the TypeScript keys and
 * the Swift client check too, so all three make the same keys.
 */
class FractionalKeyTest {
    private val vectors: JsonObject =
        Json.parseToJsonElement(File("../../../packages/cms/src/keys.vectors.json").readText()).jsonObject

    private fun JsonObject.text(name: String): String? = this[name]?.jsonPrimitive?.contentOrNull

    @Test
    fun makesEveryKeyTheVectorsGive() {
        for (vector in vectors["between"]!!.jsonArray.map { it.jsonObject }) {
            assertEquals(vector.text("key"), FractionalKey.between(vector.text("before"), vector.text("after")))
        }
        for (vector in vectors["several"]!!.jsonArray.map { it.jsonObject }) {
            assertEquals(
                vector["keys"]!!.jsonArray.map { it.jsonPrimitive.content },
                FractionalKey.keysBetween(vector.text("before"), vector.text("after"), vector["count"]!!.jsonPrimitive.int),
            )
        }
    }

    @Test
    fun keepsKeysShortThroughLongRuns() {
        val runs = vectors["runs"]!!.jsonObject
        val append = runs["append"]!!.jsonObject
        var key: String? = null
        var longest = 0
        repeat(append["count"]!!.jsonPrimitive.int) {
            key = FractionalKey.between(key, null)
            longest = maxOf(longest, key!!.length)
        }
        assertEquals(append.text("last"), key)
        assertEquals(append["longest"]!!.jsonPrimitive.int, longest)

        val prepend = runs["prepend"]!!.jsonObject
        key = null
        repeat(prepend["count"]!!.jsonPrimitive.int) { key = FractionalKey.between(null, key) }
        assertEquals(prepend.text("last"), key)

        val gap = runs["gap"]!!.jsonObject
        var low = gap.text("before")!!
        longest = 0
        repeat(gap["count"]!!.jsonPrimitive.int) {
            low = FractionalKey.between(low, gap.text("after"))
            longest = maxOf(longest, low.length)
        }
        assertEquals(gap.text("last"), low)
        assertEquals(gap["longest"]!!.jsonPrimitive.int, longest)
    }

    @Test
    fun refusesWhatIsNotAKey() {
        assertTrue(FractionalKey.isKey("a0"))
        assertFalse(FractionalKey.isKey("a0i0"))
        assertFalse(FractionalKey.isKey("b0"))
        assertFailsWith<IllegalArgumentException> { FractionalKey.between("a1", "a0") }
    }
}
